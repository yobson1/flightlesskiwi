import { error, info, warn } from '$lib/logger';
import { igdb, invalidateIgdbAccessToken } from '$lib/server/igdb';
import type { IgdbImportProgress, IgdbImportStatus } from '$lib/igdb';
import { GameSource, WebsiteCategory } from '$lib/enums/igdb';
import { IGDB_IMPORT_CRON, IGDB_IMPORT_TIME_ZONE } from '$app/env/private';
import { db } from '$lib/server/db';
import {
	game,
	involvedCompany,
	company,
	usedEngine,
	gameEngine,
	storeLink,
	store,
	syncState,
	gameName,
	benchmarkResult,
	STORES
} from '$lib/server/db/schema';
import {
	flushGameSearchQueue,
	prepareGameSearch,
	queueGamesForSearch
} from '$lib/server/game-search';
import { flushBenchmarkSearchQueue, queueBenchmarksForSearch } from '$lib/server/benchmark-search';
import { sleep } from 'bun';
import { inArray, sql } from 'drizzle-orm';
import * as v from 'valibot';

const IGDB_FIELDS =
	'name, first_release_date, parent_game, version_parent, cover.image_id, external_games.external_game_source, external_games.url, websites.url, websites.type, involved_companies.developer, involved_companies.publisher, involved_companies.company.name, involved_companies.company.websites.url, game_engines.name, game_engines.url, alternative_names.name';
const IGDB_PAGE_SIZE = 500;
const IGDB_REQUESTS_PER_BATCH = 4;
const IGDB_REQUEST_INTERVAL_MS = 1000;
const MAX_REQUEST_ATTEMPTS = 4;
const DB_WRITE_BATCH_SIZE = 200;
const httpErrorSchema = v.object({ response: v.object({ status: v.number() }) });
const websiteSchema = v.object({ url: v.string(), type: v.optional(v.number()) });
const igdbGameSchema = v.object({
	id: v.number(),
	name: v.string(),
	cover: v.optional(v.object({ image_id: v.string() })),
	external_games: v.optional(
		v.array(
			v.object({
				url: v.string(),
				external_game_source: v.number()
			})
		)
	),
	websites: v.optional(v.array(v.object({ url: v.string(), type: v.number() }))),
	first_release_date: v.optional(v.number()),
	game_engines: v.optional(
		v.array(v.object({ id: v.number(), name: v.string(), url: v.optional(v.string()) }))
	),
	involved_companies: v.optional(
		v.array(
			v.object({
				company: v.object({
					id: v.number(),
					name: v.string(),
					websites: v.optional(v.array(websiteSchema))
				}),
				developer: v.boolean(),
				publisher: v.boolean()
			})
		)
	),
	alternative_names: v.optional(v.array(v.object({ name: v.string() }))),
	parent_game: v.optional(v.number()),
	version_parent: v.optional(v.number())
});
const igdbGamesSchema = v.array(igdbGameSchema);
type IGDBGame = v.InferOutput<typeof igdbGameSchema>;

interface IgdbImportSchedulerState {
	nextImportAt: string | null;
	activeImport: IgdbImportProgress | null;
	lastFailure: IgdbImportStatus['lastFailure'];
}

const syncGlobal = globalThis as typeof globalThis & {
	flightlesskiwiIgdbImportState?: IgdbImportSchedulerState;
	flightlesskiwiIgdbSync?: Promise<void>;
};
const importTimeZone = IGDB_IMPORT_TIME_ZONE ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
const importCronOptions = { tz: importTimeZone };
let importScheduler: Bun.CronJob | undefined;

const SOURCE_TO_STORE: Record<number, number> = {
	[GameSource.steam]: STORES.STEAM.id,
	[GameSource.gog]: STORES.GOG.id,
	[GameSource.itch_io]: STORES.ITCH.id,
	[GameSource.epic_game_store]: STORES.EPIC.id
};

const WEBSITE_TO_STORE: Record<number, number> = {
	[WebsiteCategory.steam]: STORES.STEAM.id,
	[WebsiteCategory.gog]: STORES.GOG.id,
	[WebsiteCategory.itch]: STORES.ITCH.id,
	[WebsiteCategory.epicgames]: STORES.EPIC.id
};

export function seedStores() {
	db.insert(store)
		.values(Object.values(STORES))
		.onConflictDoUpdate({
			target: store.id,
			set: { name: sql`excluded.name` }
		})
		.run();
}

function extractStoreLinks(igdbGame: IGDBGame) {
	const links: Array<{ storeId: number; url: string }> = [];
	const seen = new Set<number>();

	for (const externalGame of igdbGame.external_games ?? []) {
		const storeId = SOURCE_TO_STORE[externalGame.external_game_source];
		if (storeId !== undefined && !seen.has(storeId) && externalGame.url) {
			links.push({ storeId, url: externalGame.url });
			seen.add(storeId);
		}
	}

	for (const website of igdbGame.websites ?? []) {
		const storeId = WEBSITE_TO_STORE[website.type];
		if (storeId !== undefined && !seen.has(storeId) && website.url) {
			links.push({ storeId, url: website.url });
			seen.add(storeId);
		}
	}

	return links;
}

function* chunks<T>(items: T[]) {
	for (let index = 0; index < items.length; index += DB_WRITE_BATCH_SIZE) {
		yield items.slice(index, index + DB_WRITE_BATCH_SIZE);
	}
}

function runSyncWrite<T>(
	operation: string,
	rows: T[],
	identify: (row: T) => unknown,
	write: () => void
) {
	try {
		write();
	} catch (cause) {
		const sample = rows.slice(0, 10).map(identify);
		const omittedRows = rows.length - sample.length;
		error(
			`IGDB sync database write failed (${operation}; ${rows.length} rows; sample=${JSON.stringify(sample)}${omittedRows > 0 ? `; ${omittedRows} more rows omitted` : ''})`,
			cause
		);
		throw cause;
	}
}

interface GameRelationship {
	id: number;
	parentGame: number | null;
	versionParent: number | null;
}

function syncGames(igdbGames: IGDBGame[]) {
	const games = new Map<number, typeof game.$inferInsert>();
	const relationships = new Map<number, GameRelationship>();
	const companies = new Map<number, typeof company.$inferInsert>();
	const engines = new Map<number, typeof gameEngine.$inferInsert>();
	const names = new Map<string, typeof gameName.$inferInsert>();
	const storeLinks = new Map<string, typeof storeLink.$inferInsert>();
	const involvedCompanies = new Map<string, typeof involvedCompany.$inferInsert>();
	const usedEngines = new Map<string, typeof usedEngine.$inferInsert>();

	for (const igdbGame of igdbGames) {
		const parentGame = igdbGame.parent_game ?? null;
		const versionParent = igdbGame.version_parent ?? null;

		games.set(igdbGame.id, {
			id: igdbGame.id,
			releaseDate: igdbGame.first_release_date
				? new Date(igdbGame.first_release_date * 1000)
				: null,
			coverImgId: igdbGame.cover?.image_id ?? null,
			// Apply self-references after every game batch has been imported.
			parentGame: null,
			versionParent: null
		});
		if (parentGame !== null || versionParent !== null) {
			relationships.set(igdbGame.id, {
				id: igdbGame.id,
				parentGame,
				versionParent
			});
		}

		names.set(`${igdbGame.id}:${igdbGame.name}`, {
			gameId: igdbGame.id,
			name: igdbGame.name,
			isPrimary: true
		});

		for (const alternativeName of igdbGame.alternative_names ?? []) {
			if (!alternativeName.name || alternativeName.name === igdbGame.name) continue;
			names.set(`${igdbGame.id}:${alternativeName.name}`, {
				gameId: igdbGame.id,
				name: alternativeName.name,
				isPrimary: false
			});
		}

		for (const link of extractStoreLinks(igdbGame)) {
			storeLinks.set(`${igdbGame.id}:${link.storeId}`, {
				gameId: igdbGame.id,
				storeId: link.storeId,
				url: link.url
			});
		}

		for (const involvement of igdbGame.involved_companies ?? []) {
			if (!involvement.company) continue;

			companies.set(involvement.company.id, {
				id: involvement.company.id,
				name: involvement.company.name,
				url: involvement.company.websites?.[0]?.url ?? null
			});
			involvedCompanies.set(`${igdbGame.id}:${involvement.company.id}`, {
				gameId: igdbGame.id,
				companyId: involvement.company.id,
				developer: involvement.developer,
				publisher: involvement.publisher
			});
		}

		for (const engine of igdbGame.game_engines ?? []) {
			engines.set(engine.id, {
				id: engine.id,
				name: engine.name,
				url: engine.url ?? null
			});
			usedEngines.set(`${igdbGame.id}:${engine.id}`, {
				gameId: igdbGame.id,
				engineId: engine.id
			});
		}
	}

	const gameRows = [...games.values()];
	const companyRows = [...companies.values()];
	const engineRows = [...engines.values()];
	const gameIds = [...games.keys()];

	db.transaction((tx) => {
		for (const rows of chunks(gameRows)) {
			runSyncWrite(
				'upserting games',
				rows,
				({ id }) => id,
				() => {
					tx.insert(game)
						.values(rows)
						.onConflictDoUpdate({
							target: game.id,
							set: {
								releaseDate: sql`excluded.release_date`,
								coverImgId: sql`excluded.cover_img_id`,
								parentGame: sql`excluded.parent_game_id`,
								versionParent: sql`excluded.version_parent_id`
							}
						})
						.run();
				}
			);
		}

		for (const rows of chunks(companyRows)) {
			runSyncWrite(
				'upserting companies',
				rows,
				({ id }) => id,
				() => {
					tx.insert(company)
						.values(rows)
						.onConflictDoUpdate({
							target: company.id,
							set: {
								name: sql`excluded.name`,
								url: sql`excluded.url`
							}
						})
						.run();
				}
			);
		}

		for (const rows of chunks(engineRows)) {
			runSyncWrite(
				'upserting game engines',
				rows,
				({ id }) => id,
				() => {
					tx.insert(gameEngine)
						.values(rows)
						.onConflictDoUpdate({
							target: gameEngine.id,
							set: {
								name: sql`excluded.name`,
								url: sql`excluded.url`
							}
						})
						.run();
				}
			);
		}

		for (const ids of chunks(gameIds)) {
			runSyncWrite(
				'deleting existing game names',
				ids,
				(id) => id,
				() => {
					tx.delete(gameName).where(inArray(gameName.gameId, ids)).run();
				}
			);
			runSyncWrite(
				'deleting existing store links',
				ids,
				(id) => id,
				() => {
					tx.delete(storeLink).where(inArray(storeLink.gameId, ids)).run();
				}
			);
			runSyncWrite(
				'deleting existing involved companies',
				ids,
				(id) => id,
				() => {
					tx.delete(involvedCompany).where(inArray(involvedCompany.gameId, ids)).run();
				}
			);
			runSyncWrite(
				'deleting existing used engines',
				ids,
				(id) => id,
				() => {
					tx.delete(usedEngine).where(inArray(usedEngine.gameId, ids)).run();
				}
			);
		}

		for (const rows of chunks([...names.values()])) {
			runSyncWrite(
				'inserting game names',
				rows,
				({ gameId, name }) => ({ gameId, name }),
				() => {
					tx.insert(gameName).values(rows).onConflictDoNothing().run();
				}
			);
		}
		for (const rows of chunks([...storeLinks.values()])) {
			runSyncWrite(
				'inserting store links',
				rows,
				({ gameId, storeId }) => ({ gameId, storeId }),
				() => {
					tx.insert(storeLink).values(rows).onConflictDoNothing().run();
				}
			);
		}
		for (const rows of chunks([...involvedCompanies.values()])) {
			runSyncWrite(
				'inserting involved companies',
				rows,
				({ gameId, companyId }) => ({ gameId, companyId }),
				() => {
					tx.insert(involvedCompany).values(rows).onConflictDoNothing().run();
				}
			);
		}
		for (const rows of chunks([...usedEngines.values()])) {
			runSyncWrite(
				'inserting used engines',
				rows,
				({ gameId, engineId }) => ({ gameId, engineId }),
				() => {
					tx.insert(usedEngine).values(rows).onConflictDoNothing().run();
				}
			);
		}
		for (const ids of chunks(gameIds)) {
			runSyncWrite(
				'queueing games for search indexing',
				ids,
				(id) => id,
				() => {
					queueGamesForSearch(ids, tx);
				}
			);

			const benchmarkIds = tx
				.select({ id: benchmarkResult.id })
				.from(benchmarkResult)
				.where(inArray(benchmarkResult.gameId, ids))
				.all()
				.map(({ id }) => id);
			runSyncWrite(
				'queueing affected benchmarks for search indexing',
				benchmarkIds,
				(id) => id,
				() => {
					queueBenchmarksForSearch(benchmarkIds, tx);
				}
			);
		}
	});

	return [...relationships.values()];
}

function syncGameRelationships(relationships: GameRelationship[]) {
	const referencedGameIds = [
		...new Set(
			relationships.flatMap(({ parentGame, versionParent }) =>
				[parentGame, versionParent].filter((id): id is number => id !== null)
			)
		)
	];
	const existingGameIds = new Set<number>();

	for (const ids of chunks(referencedGameIds)) {
		for (const { id } of db.select({ id: game.id }).from(game).where(inArray(game.id, ids)).all()) {
			existingGameIds.add(id);
		}
	}

	const unresolvedReferences: Array<{
		gameId: number;
		column: 'parentGame' | 'versionParent';
		referencedGameId: number;
	}> = [];
	const resolvedRelationships: GameRelationship[] = [];

	for (const { id, parentGame, versionParent } of relationships) {
		const resolvedParentGame =
			parentGame !== null && existingGameIds.has(parentGame) ? parentGame : null;
		const resolvedVersionParent =
			versionParent !== null && existingGameIds.has(versionParent) ? versionParent : null;

		if (parentGame !== null && resolvedParentGame === null) {
			unresolvedReferences.push({
				gameId: id,
				column: 'parentGame',
				referencedGameId: parentGame
			});
		}
		if (versionParent !== null && resolvedVersionParent === null) {
			unresolvedReferences.push({
				gameId: id,
				column: 'versionParent',
				referencedGameId: versionParent
			});
		}
		if (resolvedParentGame !== null || resolvedVersionParent !== null) {
			resolvedRelationships.push({
				id,
				parentGame: resolvedParentGame,
				versionParent: resolvedVersionParent
			});
		}
	}

	if (unresolvedReferences.length > 0) {
		const sample = unresolvedReferences.slice(0, 20);
		const omittedReferences = unresolvedReferences.length - sample.length;
		warn(
			`Left ${unresolvedReferences.length} IGDB game relationships unset because the referenced games do not exist; sample=${JSON.stringify(sample)}${omittedReferences > 0 ? `; ${omittedReferences} more references omitted` : ''}`
		);
	}

	db.transaction((tx) => {
		for (const rows of chunks(resolvedRelationships)) {
			runSyncWrite(
				'updating game relationships',
				rows,
				({ id, parentGame, versionParent }) => ({ id, parentGame, versionParent }),
				() => {
					tx.insert(game)
						.values(rows)
						.onConflictDoUpdate({
							target: game.id,
							set: {
								parentGame: sql`excluded.parent_game_id`,
								versionParent: sql`excluded.version_parent_id`
							}
						})
						.run();
				}
			);
		}

		for (const ids of chunks(resolvedRelationships.map(({ id }) => id))) {
			runSyncWrite(
				'queueing relationship updates for search indexing',
				ids,
				(id) => id,
				() => {
					queueGamesForSearch(ids, tx);
				}
			);
		}
	});

	return resolvedRelationships.length;
}

class IgdbRateLimiter {
	private requestStarts: number[] = [];
	private queue = Promise.resolve();

	async run<T>(request: () => Promise<T>) {
		const previous = this.queue;
		let release!: () => void;
		this.queue = new Promise<void>((resolve) => {
			release = resolve;
		});

		await previous;

		try {
			let now = Date.now();
			this.requestStarts = this.requestStarts.filter(
				(startedAt) => now - startedAt < IGDB_REQUEST_INTERVAL_MS
			);

			if (this.requestStarts.length >= IGDB_REQUESTS_PER_BATCH) {
				const oldestRequestStart = this.requestStarts[0];
				if (oldestRequestStart === undefined) {
					throw new Error('IGDB rate limiter queue is unexpectedly empty');
				}
				await sleep(IGDB_REQUEST_INTERVAL_MS - (now - oldestRequestStart));
				now = Date.now();
				this.requestStarts = this.requestStarts.filter(
					(startedAt) => now - startedAt < IGDB_REQUEST_INTERVAL_MS
				);
			}

			this.requestStarts.push(Date.now());
		} finally {
			release();
		}

		return request();
	}
}

function parseHttpStatus(cause: unknown): number | undefined {
	const result = v.safeParse(httpErrorSchema, cause);
	return result.success ? result.output.response.status : undefined;
}

function shouldRetry(cause: unknown) {
	const status = parseHttpStatus(cause);
	return (
		status === undefined ||
		status === 401 ||
		status === 408 ||
		status === 425 ||
		status === 429 ||
		status >= 500
	);
}

async function requestWithRetry<T>(
	rateLimiter: IgdbRateLimiter,
	description: string,
	request: () => Promise<T>
) {
	for (let attempt = 1; attempt <= MAX_REQUEST_ATTEMPTS; attempt++) {
		try {
			return await rateLimiter.run(request);
		} catch (cause) {
			if (attempt === MAX_REQUEST_ATTEMPTS || !shouldRetry(cause)) throw cause;

			const status = parseHttpStatus(cause);
			if (status === 401) invalidateIgdbAccessToken();
			const retryDelay = IGDB_REQUEST_INTERVAL_MS * 2 ** (attempt - 1);
			warn(`${description} failed${status ? ` (${status})` : ''}; retrying in ${retryDelay}ms`);
			await sleep(retryDelay);
		}
	}

	throw new Error(`${description} failed`);
}

async function fetchGames(
	rateLimiter: IgdbRateLimiter,
	filter: string,
	offset: number,
	totalGames: number
) {
	const remainingGames = totalGames - offset;
	const requestCount = Math.min(
		IGDB_REQUESTS_PER_BATCH,
		Math.ceil(remainingGames / IGDB_PAGE_SIZE)
	);

	const responses = await Promise.all(
		Array.from({ length: requestCount }, async (_, index) => {
			const pageOffset = offset + index * IGDB_PAGE_SIZE;
			const pageSize = Math.min(IGDB_PAGE_SIZE, totalGames - pageOffset);

			return requestWithRetry(
				rateLimiter,
				`IGDB games request at offset ${pageOffset}`,
				async () => {
					const response = await (
						await igdb()
					)
						.fields(IGDB_FIELDS)
						.limit(pageSize)
						.offset(pageOffset)
						.sort('id', 'asc')
						.where(filter)
						.request('/games');

					const result = v.safeParse(igdbGamesSchema, response.data);
					if (!result.success) {
						throw new Error(`IGDB returned an invalid response at offset ${pageOffset}`);
					}

					return result.output;
				}
			);
		})
	);

	return responses.flat();
}

async function igdbSync(
	lastSyncTimestamp: number,
	gameSearchReady: boolean,
	progress: IgdbImportProgress
) {
	// Leave the current second open so records created while this sync starts are picked up next time.
	const syncUpperBound = Math.floor(Date.now() / 1000) - 1;
	progress.syncFrom =
		lastSyncTimestamp === 0 ? null : new Date(lastSyncTimestamp * 1000).toISOString();
	progress.syncThrough = new Date(syncUpperBound * 1000).toISOString();
	progress.phase = 'checking';
	if (syncUpperBound <= lastSyncTimestamp) return;

	const filter = `updated_at > ${lastSyncTimestamp} & updated_at <= ${syncUpperBound}`;
	const rateLimiter = new IgdbRateLimiter();
	const startedAt = Date.now();

	info(
		`Syncing games updated between ${new Date(lastSyncTimestamp * 1000).toISOString()} and ${new Date(syncUpperBound * 1000).toISOString()}`
	);

	const countResponse = await requestWithRetry(rateLimiter, 'IGDB game count request', async () =>
		(await igdb(`where ${filter};`)).request('/games/count')
	);
	const totalGames = Number(countResponse.data.count);

	if (!Number.isSafeInteger(totalGames) || totalGames < 0) {
		throw new Error(`IGDB returned an invalid game count: ${countResponse.data.count}`);
	}

	info(`Found ${totalGames} games to sync`);

	progress.phase = 'importing';
	progress.totalGames = totalGames;
	progress.pendingGames = totalGames;
	let importedGames = 0;
	let benchmarkSearchReady = true;
	const relationships = new Map<number, GameRelationship>();

	while (importedGames < totalGames) {
		const games = await fetchGames(rateLimiter, filter, importedGames, totalGames);
		const expectedGames = Math.min(
			IGDB_PAGE_SIZE * IGDB_REQUESTS_PER_BATCH,
			totalGames - importedGames
		);

		const reachedEndOfResults = games.length < expectedGames;

		for (const relationship of syncGames(games)) {
			relationships.set(relationship.id, relationship);
		}
		importedGames += games.length;
		progress.importedGames = importedGames;
		progress.pendingGames = Math.max(totalGames - importedGames, 0);
		info(`Imported ${importedGames}/${totalGames} games`);

		if (gameSearchReady) {
			try {
				await flushGameSearchQueue();
			} catch (cause) {
				gameSearchReady = false;
				warn('Game search indexing failed; queued games will be retried on restart', cause);
			}
		}
		if (benchmarkSearchReady) {
			try {
				const indexedBenchmarks = await flushBenchmarkSearchQueue();
				if (indexedBenchmarks > 0) {
					info(`Reindexed ${indexedBenchmarks} benchmarks affected by game updates`);
				}
			} catch (cause) {
				benchmarkSearchReady = false;
				warn(
					'Benchmark search indexing failed; queued benchmarks will be retried on restart',
					cause
				);
			}
		}

		if (reachedEndOfResults) {
			warn(
				`IGDB returned ${games.length} games at offset ${importedGames - games.length}; expected ${expectedGames}. Treating the short page as the end of the result set`
			);
			break;
		}
	}

	progress.phase = 'finalizing';
	const updatedRelationships = syncGameRelationships([...relationships.values()]);
	if (updatedRelationships > 0) {
		info(`Applied parent/version relationships to ${updatedRelationships} games`);
	}

	if (gameSearchReady && updatedRelationships > 0) {
		try {
			await flushGameSearchQueue();
		} catch (cause) {
			warn('Game search indexing failed; queued games will be retried on restart', cause);
		}
	}

	setLastSyncTime(syncUpperBound);
	info(
		`IGDB sync complete: ${importedGames} games in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`
	);
}

function setLastSyncTime(timestamp: number) {
	db.transaction((tx) => {
		tx.delete(syncState).run();
		tx.insert(syncState)
			.values({ lastSync: new Date(timestamp * 1000) })
			.run();
	});
}

function getLastSyncTime() {
	const state = db.select().from(syncState).get();
	return state ? Math.floor(state.lastSync.getTime() / 1000) : 0;
}

function getImportSchedulerState() {
	syncGlobal.flightlesskiwiIgdbImportState ??= {
		nextImportAt: null,
		activeImport: null,
		lastFailure: null
	};
	return syncGlobal.flightlesskiwiIgdbImportState;
}

function getNextImportAt() {
	// @ts-expect-error The published Bun canary types do not include the Bun 1.4 tz option yet.
	return Bun.cron.parse(IGDB_IMPORT_CRON!, Date.now(), importCronOptions)?.toISOString() ?? null;
}

export function getIgdbImportStatus(): IgdbImportStatus {
	const state = getImportSchedulerState();
	const lastSyncTimestamp = getLastSyncTime();

	return {
		schedule: IGDB_IMPORT_CRON!,
		timeZone: importTimeZone,
		nextImportAt: state.nextImportAt ?? (state.activeImport === null ? getNextImportAt() : null),
		lastSuccessfulImportAt:
			lastSyncTimestamp === 0 ? null : new Date(lastSyncTimestamp * 1000).toISOString(),
		activeImport: state.activeImport ? { ...state.activeImport } : null,
		lastFailure: state.lastFailure ? { ...state.lastFailure } : null
	};
}

async function syncGameSearch() {
	try {
		const indexedGames = await prepareGameSearch();
		if (indexedGames > 0) info(`Indexed ${indexedGames} games in Meilisearch`);
		return true;
	} catch (cause) {
		warn('Meilisearch is unavailable; game imports will continue and queue search updates', cause);
		return false;
	}
}

export function startIgdbSync() {
	if (syncGlobal.flightlesskiwiIgdbSync) return syncGlobal.flightlesskiwiIgdbSync;

	const state = getImportSchedulerState();
	const progress: IgdbImportProgress = {
		startedAt: new Date().toISOString(),
		syncFrom: null,
		syncThrough: null,
		phase: 'preparing',
		importedGames: 0,
		totalGames: null,
		pendingGames: null
	};
	state.activeImport = progress;

	const sync = Promise.resolve()
		.then(async () => {
			const gameSearchReady = await syncGameSearch();
			await igdbSync(getLastSyncTime(), gameSearchReady, progress);
			state.lastFailure = null;
		})
		.catch((cause) => {
			error('IGDB sync failed; the current sync window will restart from the beginning', cause);
			state.lastFailure = {
				failedAt: new Date().toISOString()
			};
		})
		.finally(() => {
			if (state.activeImport === progress) state.activeImport = null;
			if (syncGlobal.flightlesskiwiIgdbSync === sync) {
				delete syncGlobal.flightlesskiwiIgdbSync;
			}
		});

	syncGlobal.flightlesskiwiIgdbSync = sync;
	return sync;
}

export function startIgdbImportScheduler() {
	if (importScheduler) return;

	const state = getImportSchedulerState();
	state.nextImportAt = getNextImportAt();

	const runImport = async () => {
		state.nextImportAt = null;
		try {
			await startIgdbSync();
		} finally {
			state.nextImportAt = getNextImportAt();
		}
	};
	// @ts-expect-error The published Bun canary types do not include the Bun 1.4 tz option yet.
	importScheduler = Bun.cron(IGDB_IMPORT_CRON!, runImport, importCronOptions).unref();

	info(
		`Scheduled IGDB imports with "${IGDB_IMPORT_CRON}" (${importTimeZone}); next import at ${state.nextImportAt}`
	);
}
