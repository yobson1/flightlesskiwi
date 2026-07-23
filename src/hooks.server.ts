import type { Handle } from '@sveltejs/kit';
import { info } from '$lib/logger';
import { igdb } from '$lib/server/igdb';
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
	STORES
} from '$lib/server/db/schema';
import * as auth from '$lib/server/auth';
import { sleep } from 'bun';
import { and, eq } from 'drizzle-orm';

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
	db.insert(store).values(Object.values(STORES)).onConflictDoNothing().run();
}

function extractStoreLinks(igdbGame: IGDBGame) {
	const links: Array<{ storeId: number; url: string }> = [];
	const seen = new Set<number>();

	// Map IGDB enums to our store IDs
	const sourceToStore: Record<number, number> = {
		[GameSource.steam]: STORES.STEAM.id,
		[GameSource.gog]: STORES.GOG.id,
		[GameSource.itch_io]: STORES.ITCH.id,
		[GameSource.epic_game_store]: STORES.EPIC.id
	};
	const websiteToStore: Record<number, number> = {
		[WebsiteCategory.steam]: STORES.STEAM.id,
		[WebsiteCategory.gog]: STORES.GOG.id,
		[WebsiteCategory.itch]: STORES.ITCH.id,
		[WebsiteCategory.epicgames]: STORES.EPIC.id
	};

	// Store links can be in either external_games or websites
	if (igdbGame.external_games) {
		for (const externalGame of igdbGame.external_games) {
			const storeId = sourceToStore[externalGame.external_game_source];
			if (storeId !== undefined && !seen.has(storeId) && externalGame.url) {
				links.push({ storeId, url: externalGame.url });
				seen.add(storeId);
			}
		}
	}

	if (igdbGame.websites) {
		for (const website of igdbGame.websites) {
			const storeId = websiteToStore[website.type];
			if (storeId !== undefined && !seen.has(storeId) && website.url) {
				links.push({ storeId, url: website.url });
				seen.add(storeId);
			}
		}
	}

	return links;
}

function syncGames(igdbGames: IGDBGame[]) {
	for (const igdbGame of igdbGames) {
		db.insert(game)
			.values({
				id: igdbGame.id,
				releaseDate: igdbGame.first_release_date
					? new Date(igdbGame.first_release_date * 1000)
					: null,
				coverImgId: igdbGame.cover?.image_id || null,
				parentGame: igdbGame.parent_game || null,
				versionParent: igdbGame.version_parent || null
			})
			.onConflictDoUpdate({
				target: game.id,
				set: {
					releaseDate: igdbGame.first_release_date
						? new Date(igdbGame.first_release_date * 1000)
						: null,
					coverImgId: igdbGame.cover?.image_id || null,
					parentGame: igdbGame.parent_game || null,
					versionParent: igdbGame.version_parent || null
				}
			})
			.run();

		// update existing primary if exists
		const updated = db
			.update(gameName)
			.set({ name: igdbGame.name })
			.where(and(eq(gameName.gameId, igdbGame.id), eq(gameName.isPrimary, true)))
			.returning()
			.all();

		if (updated.length === 0) {
			db.insert(gameName)
				.values({
					gameId: igdbGame.id,
					name: igdbGame.name,
					isPrimary: true
				})
				.onConflictDoNothing()
				.run();
		}

		const storeLinks = extractStoreLinks(igdbGame);
		if (storeLinks.length > 0) {
			for (const link of storeLinks) {
				db.insert(storeLink)
					.values({
						gameId: igdbGame.id,
						storeId: link.storeId,
						url: link.url
					})
					.onConflictDoUpdate({
						target: [storeLink.gameId, storeLink.storeId],
						set: {
							url: link.url
						}
					})
					.run();
			}
		}

		if (igdbGame.involved_companies) {
			for (const ic of igdbGame.involved_companies) {
				if (!ic.company) continue;

				db.insert(company)
					.values({
						id: ic.company.id,
						name: ic.company.name,
						url: ic.company.websites?.[0]?.url || null
					})
					.onConflictDoUpdate({
						target: company.id,
						set: {
							name: ic.company.name,
							url: ic.company.websites?.[0]?.url || null
						}
					})
					.run();
			}

			for (const ic of igdbGame.involved_companies) {
				db.insert(involvedCompany)
					.values({
						gameId: igdbGame.id,
						companyId: ic.company.id,
						developer: ic.developer,
						publisher: ic.publisher
					})
					.onConflictDoUpdate({
						target: [involvedCompany.gameId, involvedCompany.companyId],
						set: {
							developer: ic.developer,
							publisher: ic.publisher
						}
					})
					.run();
			}
		}

		if (igdbGame.game_engines) {
			for (const engine of igdbGame.game_engines) {
				db.insert(gameEngine)
					.values({
						id: engine.id,
						name: engine.name,
						url: engine.url || null
					})
					.onConflictDoUpdate({
						target: gameEngine.id,
						set: {
							name: engine.name,
							url: engine.url || null
						}
					})
					.run();
			}

			db.insert(usedEngine)
				.values(
					igdbGame.game_engines.map((engine) => ({
						gameId: igdbGame.id,
						engineId: engine.id
					}))
				)
				.onConflictDoNothing()
				.run();
		}

		if (igdbGame.alternative_names) {
			db.insert(gameName)
				.values(
					igdbGame.alternative_names.map((name) => ({
						gameId: igdbGame.id,
						name: name.name
					}))
				)
				.onConflictDoNothing()
				.run();
		}
	}
}

async function igdbSync(lastSyncTimestamp: number) {
	info(
		`Syncing games since ${new Date(lastSyncTimestamp * 1000).toISOString()}(${lastSyncTimestamp})`
	);

	const REQUESTS_PER_BATCH = 4;
	const GAMES_PER_REQUEST = 500;
	const GAMES_PER_BATCH = REQUESTS_PER_BATCH * GAMES_PER_REQUEST;
	const BATCH_DELAY = 1000;
	const FIELDS =
		'name, first_release_date, parent_game, version_parent, cover.image_id, external_games.external_game_source, external_games.url, websites.url, websites.type, involved_companies.developer, involved_companies.publisher, involved_companies.company.name, involved_companies.company.websites.url, game_engines.name, game_engines.url, alternative_names.name';

	const totalGames = (
		await (
			await igdb()
		)
			.fields('id')
			.where(`updated_at > ${lastSyncTimestamp}`)
			.request('/games/count')
	).data.count;

	if (totalGames === 0) {
		info('No new games to sync');
		return;
	}

	info(`Syncing ${totalGames} games`);
	await sleep(BATCH_DELAY);

	// Helper function to fetch a batch of 4 requests
	async function fetchBatch(startOffset: number): Promise<IGDBGame[]> {
		const promises: Promise<{ data: IGDBGame[] }>[] = [];

		for (let i = 0; i < REQUESTS_PER_BATCH; i++) {
			const offset = startOffset + i * GAMES_PER_REQUEST;

			promises.push(
				(await igdb())
					.fields(FIELDS)
					.limit(GAMES_PER_REQUEST)
					.offset(offset)
					.sort('created_at', 'asc')
					.where(`updated_at > ${lastSyncTimestamp}`)
					.request('/games')
			);
		}

		const results = await Promise.all(promises);
		return results.flatMap((result) => result.data);
	}

	let offset = 0;

	// Fetch the initial batch and wait
	info(`Fetching initial batch (games 0 to ${Math.min(GAMES_PER_BATCH, totalGames)})...`);
	let currentGames = await fetchBatch(offset);
	await sleep(BATCH_DELAY);

	while (currentGames.length > 0) {
		const iterationStart = Date.now();
		const currentOffset = offset;
		offset += GAMES_PER_BATCH;

		// Kick off the next batch fetch immediately (don't await yet)
		info(`Processing games ${currentOffset} to ${currentOffset + currentGames.length}...`);
		const nextBatchPromise = fetchBatch(offset);

		// Process the current batch
		db.transaction(() => syncGames(currentGames));

		if (currentGames.length < GAMES_PER_BATCH) break;

		// Await the next batch and ensure we respect rate limits
		const iterationTime = Date.now() - iterationStart;
		const remainingDelay = BATCH_DELAY - iterationTime;

		if (remainingDelay > 0) {
			info(`Waiting ${remainingDelay}ms before fetching next batch...`);
			await sleep(remainingDelay);
		}

		currentGames = await nextBatchPromise;
	}

	info('Sync complete!');
	setLastSyncTime();
}

function setLastSyncTime() {
	const state = db.select().from(syncState).get();

	if (state) {
		db.update(syncState).set({ lastSync: new Date() }).run();
	} else {
		db.insert(syncState).values({ lastSync: new Date() }).run();
	}
}

function getLastSyncTime() {
	const state = db.select().from(syncState).get();
	return state ? Math.floor(state.lastSync.getTime() / 1000) : 0;
}

seedStores();
igdbSync(getLastSyncTime());
