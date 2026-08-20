import { db } from '#lib/server/db/index.js';
import { game, gameName } from '#lib/server/db/schema.js';
import { createMeilisearchIndex } from '#lib/server/meilisearch.js';
import type { GameSearchResult } from '#lib/types/game.js';
import { eq, inArray } from 'drizzle-orm';

const INDEX_NAME = 'games';
const SEARCH_LIMIT = 15;
const SEARCH_CANDIDATE_LIMIT = 50;
const INDEX_DOCUMENT_VERSION = 1;
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

const {
	index,
	ready: getReadyIndex,
	queue: queueGamesForSearch,
	flush: flushGameSearchQueue,
	prepare: prepareGameSearch
} = createMeilisearchIndex<GameSearchDocument, number>({
	name: INDEX_NAME,
	searchableAttributes: SEARCHABLE_ATTRIBUTES,
	displayedAttributes: DISPLAYED_ATTRIBUTES,
	documentVersion: INDEX_DOCUMENT_VERSION,
	getAllDocumentIds: () =>
		db
			.select({ id: game.id })
			.from(game)
			.all()
			.map(({ id }) => id),
	getDocuments,
	parseDocumentId: (documentId) => Number(documentId)
});

export { flushGameSearchQueue, prepareGameSearch, queueGamesForSearch };

export function getGameSearchResult(gameId: number): GameSearchResult | null {
	return getDocuments([gameId]).at(0) ?? null;
}

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
