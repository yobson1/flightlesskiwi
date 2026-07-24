import { db } from '$lib/server/db';
import { game, gameName, gameSearchQueue } from '$lib/server/db/schema';
import { createMeilisearchIndex, waitForMeilisearchTask } from '$lib/server/meilisearch';
import type { GameSearchResult } from '$lib/types/game';
import { count, eq, inArray } from 'drizzle-orm';

const INDEX_NAME = 'games';
const INDEX_BATCH_SIZE = 1_000;
const SEARCH_LIMIT = 15;
const SEARCH_CANDIDATE_LIMIT = 50;
const SEARCHABLE_ATTRIBUTES = ['name', 'names'];
const DISPLAYED_ATTRIBUTES = [
	'id',
	'name',
	'names',
	'releaseDate',
	'coverImgId',
	'parentGame',
	'versionParent'
];

interface GameSearchDocument extends GameSearchResult {
	names: string[];
}

const { index, ready: getReadyIndex } = createMeilisearchIndex<GameSearchDocument>({
	name: INDEX_NAME,
	searchableAttributes: SEARCHABLE_ATTRIBUTES,
	displayedAttributes: DISPLAYED_ATTRIBUTES
});

function getDocuments(gameIds: number[]) {
	const rows = db
		.select({
			id: game.id,
			releaseDate: game.releaseDate,
			coverImgId: game.coverImgId,
			parentGame: game.parentGame,
			versionParent: game.versionParent,
			name: gameName.name,
			isPrimary: gameName.isPrimary
		})
		.from(game)
		.innerJoin(gameName, eq(gameName.gameId, game.id))
		.where(inArray(gameName.gameId, gameIds))
		.all();

	const documents = new Map<number, GameSearchDocument>();

	for (const row of rows) {
		const existing = documents.get(row.id);
		if (existing) {
			existing.names.push(row.name);
			if (row.isPrimary) existing.name = row.name;
			continue;
		}

		documents.set(row.id, {
			id: row.id,
			name: row.name,
			names: [row.name],
			releaseDate: row.releaseDate?.toISOString() ?? null,
			coverImgId: row.coverImgId,
			parentGame: row.parentGame,
			versionParent: row.versionParent
		});
	}

	return [...documents.values()];
}

function queueGamesForSearch(gameIds: number[]) {
	for (let index = 0; index < gameIds.length; index += INDEX_BATCH_SIZE) {
		db.insert(gameSearchQueue)
			.values(gameIds.slice(index, index + INDEX_BATCH_SIZE).map((gameId) => ({ gameId })))
			.onConflictDoNothing()
			.run();
	}
}

export async function prepareGameSearch() {
	await getReadyIndex();

	const databaseCount = db.select({ count: count() }).from(game).get()?.count ?? 0;
	const { numberOfDocuments } = await index.getStats();

	if (databaseCount !== numberOfDocuments) {
		if (numberOfDocuments > 0) {
			await waitForMeilisearchTask(index.deleteAllDocuments());
		}
		const gameIds = db.select({ id: game.id }).from(game).all();
		queueGamesForSearch(gameIds.map(({ id }) => id));
	}
}

export async function flushGameSearchQueue() {
	let indexedGames = 0;

	while (true) {
		const queuedGames = db
			.select({ gameId: gameSearchQueue.gameId })
			.from(gameSearchQueue)
			.limit(INDEX_BATCH_SIZE)
			.all();
		if (queuedGames.length === 0) return indexedGames;

		const gameIds = queuedGames.map(({ gameId }) => gameId);
		const documents = getDocuments(gameIds);

		if (documents.length > 0) {
			await waitForMeilisearchTask(index.addDocuments(documents, { primaryKey: 'id' }));
		}

		db.delete(gameSearchQueue).where(inArray(gameSearchQueue.gameId, gameIds)).run();
		indexedGames += documents.length;
	}
}

export async function searchGames(query: string): Promise<GameSearchResult[]> {
	await getReadyIndex();

	const response = await index.search<GameSearchDocument>(query, {
		limit: SEARCH_CANDIDATE_LIMIT,
		attributesToRetrieve: DISPLAYED_ATTRIBUTES
	});
	const normalizedQuery = query.toLowerCase();

	response.hits.sort(
		(left, right) =>
			Number(right.names.some((name) => name.toLowerCase() === normalizedQuery)) -
			Number(left.names.some((name) => name.toLowerCase() === normalizedQuery))
	);

	return response.hits.slice(0, SEARCH_LIMIT).map((game) => ({
		id: game.id,
		name: game.name,
		releaseDate: game.releaseDate,
		coverImgId: game.coverImgId,
		parentGame: game.parentGame,
		versionParent: game.versionParent
	}));
}
