import { building } from '$app/environment';
import type { Handle } from '@sveltejs/kit';
import { error, info, warn } from '$lib/logger';
import { igdb, invalidateIgdbAccessToken } from '$lib/server/igdb';
import type { Game as IGDBGame } from '$lib/types/igdb';
import { GameSource, WebsiteCategory } from '$lib/enums/igdb';
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
	gameSearchQueue,
	STORES
} from '$lib/server/db/schema';
import { flushGameSearchQueue, prepareGameSearch } from '$lib/server/game-search';
import * as auth from '$lib/server/auth';
import { sleep } from 'bun';
import { inArray, sql } from 'drizzle-orm';

const IGDB_FIELDS =
	'name, first_release_date, parent_game, version_parent, cover.image_id, external_games.external_game_source, external_games.url, websites.url, websites.type, involved_companies.developer, involved_companies.publisher, involved_companies.company.name, involved_companies.company.websites.url, game_engines.name, game_engines.url, alternative_names.name';
const IGDB_PAGE_SIZE = 500;
const IGDB_REQUESTS_PER_BATCH = 4;
const IGDB_REQUEST_INTERVAL_MS = 1000;
const MAX_REQUEST_ATTEMPTS = 4;
const DB_WRITE_BATCH_SIZE = 200;

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

const handleAuth: Handle = async ({ event, resolve }) => {
	const sessionToken = event.cookies.get(auth.sessionCookieName);

	if (!sessionToken) {
		event.locals.user = null;
		event.locals.session = null;
		return resolve(event);
	}

	const { session, user } = await auth.validateSessionToken(sessionToken);

	if (session) {
		auth.setSessionTokenCookie(event, sessionToken, session.expiresAt);
	} else {
		auth.deleteSessionTokenCookie(event);
	}

	event.locals.user = user;
	event.locals.session = session;
	return resolve(event);
};

export const handle: Handle = handleAuth;

function seedStores() {
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

function syncGames(igdbGames: IGDBGame[]) {
	const games = new Map<number, typeof game.$inferInsert>();
	const companies = new Map<number, typeof company.$inferInsert>();
	const engines = new Map<number, typeof gameEngine.$inferInsert>();
	const names = new Map<string, typeof gameName.$inferInsert>();
	const storeLinks = new Map<string, typeof storeLink.$inferInsert>();
	const involvedCompanies = new Map<string, typeof involvedCompany.$inferInsert>();
	const usedEngines = new Map<string, typeof usedEngine.$inferInsert>();

	for (const igdbGame of igdbGames) {
		games.set(igdbGame.id, {
			id: igdbGame.id,
			releaseDate: igdbGame.first_release_date
				? new Date(igdbGame.first_release_date * 1000)
				: null,
			coverImgId: igdbGame.cover?.image_id ?? null,
			parentGame: igdbGame.parent_game ?? null,
			versionParent: igdbGame.version_parent ?? null
		});

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

		for (const rows of chunks(companyRows)) {
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

		for (const rows of chunks(engineRows)) {
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

		for (const ids of chunks(gameIds)) {
			tx.delete(gameName).where(inArray(gameName.gameId, ids)).run();
			tx.delete(storeLink).where(inArray(storeLink.gameId, ids)).run();
			tx.delete(involvedCompany).where(inArray(involvedCompany.gameId, ids)).run();
			tx.delete(usedEngine).where(inArray(usedEngine.gameId, ids)).run();
		}

		for (const rows of chunks([...names.values()])) {
			tx.insert(gameName).values(rows).onConflictDoNothing().run();
		}
		for (const rows of chunks([...storeLinks.values()])) {
			tx.insert(storeLink).values(rows).onConflictDoNothing().run();
		}
		for (const rows of chunks([...involvedCompanies.values()])) {
			tx.insert(involvedCompany).values(rows).onConflictDoNothing().run();
		}
		for (const rows of chunks([...usedEngines.values()])) {
			tx.insert(usedEngine).values(rows).onConflictDoNothing().run();
		}
		for (const ids of chunks(gameIds)) {
			tx.insert(gameSearchQueue)
				.values(ids.map((gameId) => ({ gameId })))
				.onConflictDoNothing()
				.run();
		}
	});
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
				await sleep(IGDB_REQUEST_INTERVAL_MS - (now - this.requestStarts[0]));
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

function getHttpStatus(cause: unknown) {
	if (!cause || typeof cause !== 'object' || !('response' in cause)) return;
	const response = cause.response;
	if (!response || typeof response !== 'object' || !('status' in response)) return;
	return typeof response.status === 'number' ? response.status : undefined;
}

function isRetryable(cause: unknown) {
	const status = getHttpStatus(cause);
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
			if (attempt === MAX_REQUEST_ATTEMPTS || !isRetryable(cause)) throw cause;

			if (getHttpStatus(cause) === 401) invalidateIgdbAccessToken();
			const retryDelay = IGDB_REQUEST_INTERVAL_MS * 2 ** (attempt - 1);
			warn(
				`${description} failed${getHttpStatus(cause) ? ` (${getHttpStatus(cause)})` : ''}; retrying in ${retryDelay}ms`
			);
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

					if (!Array.isArray(response.data) || response.data.length !== pageSize) {
						throw new Error(
							`IGDB returned ${Array.isArray(response.data) ? response.data.length : 'invalid'} rows at offset ${pageOffset}; expected ${pageSize}`
						);
					}

					return response;
				}
			);
		})
	);

	return responses.flatMap((response) => response.data as IGDBGame[]);
}

async function igdbSync(lastSyncTimestamp: number, gameSearchReady: boolean) {
	// Leave the current second open so records created while this sync starts are picked up next time.
	const syncUpperBound = Math.floor(Date.now() / 1000) - 1;
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

	let importedGames = 0;

	while (importedGames < totalGames) {
		const games = await fetchGames(rateLimiter, filter, importedGames, totalGames);
		const expectedGames = Math.min(
			IGDB_PAGE_SIZE * IGDB_REQUESTS_PER_BATCH,
			totalGames - importedGames
		);

		if (games.length !== expectedGames) {
			throw new Error(`IGDB returned ${games.length} games; expected ${expectedGames}`);
		}

		syncGames(games);
		importedGames += games.length;
		info(`Imported ${importedGames}/${totalGames} games`);

		if (gameSearchReady) {
			try {
				await flushGameSearchQueue();
			} catch (cause) {
				gameSearchReady = false;
				warn('Game search indexing failed; queued games will be retried on restart', cause);
			}
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

const syncGlobal = globalThis as typeof globalThis & {
	flightlesskiwiIgdbSync?: Promise<void>;
};

async function syncGameSearch() {
	try {
		await prepareGameSearch();
		const indexedGames = await flushGameSearchQueue();
		if (indexedGames > 0) info(`Indexed ${indexedGames} games in Meilisearch`);
		return true;
	} catch (cause) {
		warn('Meilisearch is unavailable; game imports will continue and queue search updates', cause);
		return false;
	}
}

function startIgdbSync() {
	if (syncGlobal.flightlesskiwiIgdbSync) return;

	const sync = Promise.resolve()
		.then(async () => {
			const gameSearchReady = await syncGameSearch();
			await igdbSync(getLastSyncTime(), gameSearchReady);
		})
		.catch((cause) => {
			error('IGDB sync failed; it will resume from the previous checkpoint on restart', cause);
		})
		.finally(() => {
			if (syncGlobal.flightlesskiwiIgdbSync === sync) {
				delete syncGlobal.flightlesskiwiIgdbSync;
			}
		});

	syncGlobal.flightlesskiwiIgdbSync = sync;
}

if (!building) {
	seedStores();
	startIgdbSync();
}
