import { getBenchmarkRunMetadata } from '$lib/server/benchmarks';
import { warn } from '$lib/logger';
import { db } from '$lib/server/db';
import { benchmarkResult, game, gameName, user } from '$lib/server/db/schema';
import { createMeilisearchIndex } from '$lib/server/meilisearch';
import { and, eq, inArray } from 'drizzle-orm';

const INDEX_NAME = 'benchmarks';
const SEARCH_LIMIT = 100;
const INDEX_DOCUMENT_VERSION = 4;
const SEARCHABLE_ATTRIBUTES = ['title', 'gameNames', 'runMetadata'];
const DISPLAYED_ATTRIBUTES = ['id', 'gameId', 'cpus', 'gpus'];
const FILTERABLE_ATTRIBUTES = ['gameId'];

interface BenchmarkSearchDocument {
	id: string;
	gameId: number;
	title: string;
	gameNames: string[];
	cpus: string[];
	gpus: string[];
	runMetadata: string[];
}

const {
	index,
	ready: getReadyIndex,
	queue: queueBenchmarksForSearch,
	flush: flushBenchmarkSearchQueue,
	prepare: prepareBenchmarkSearch
} = createMeilisearchIndex<BenchmarkSearchDocument, string>({
	name: INDEX_NAME,
	searchableAttributes: SEARCHABLE_ATTRIBUTES,
	displayedAttributes: DISPLAYED_ATTRIBUTES,
	filterableAttributes: FILTERABLE_ATTRIBUTES,
	documentVersion: INDEX_DOCUMENT_VERSION,
	getAllDocumentIds: () =>
		db
			.select({ id: benchmarkResult.id })
			.from(benchmarkResult)
			.all()
			.map(({ id }) => id),
	getDocuments: getSearchDocuments,
	parseDocumentId: (documentId) => documentId
});

export { flushBenchmarkSearchQueue, prepareBenchmarkSearch, queueBenchmarksForSearch };

const syncGlobal = globalThis as typeof globalThis & {
	flightlesskiwiBenchmarkSearchSync?: Promise<void>;
};

export function startBenchmarkSearchSync() {
	if (syncGlobal.flightlesskiwiBenchmarkSearchSync) return;

	const sync = prepareBenchmarkSearch()
		.then(() => undefined)
		.catch((cause) => {
			warn('Meilisearch is unavailable; benchmark search indexing will retry on restart', cause);
		})
		.finally(() => {
			if (syncGlobal.flightlesskiwiBenchmarkSearchSync === sync) {
				delete syncGlobal.flightlesskiwiBenchmarkSearchSync;
			}
		});

	syncGlobal.flightlesskiwiBenchmarkSearchSync = sync;
}

async function getSearchDocuments(benchmarkIds: string[]) {
	if (benchmarkIds.length === 0) return [];

	const rows = db
		.select({
			id: benchmarkResult.id,
			gameId: benchmarkResult.gameId,
			title: benchmarkResult.title,
			gameName: gameName.name
		})
		.from(benchmarkResult)
		.innerJoin(gameName, eq(benchmarkResult.gameId, gameName.gameId))
		.where(inArray(benchmarkResult.id, benchmarkIds))
		.all();
	const documents = new Map<string, BenchmarkSearchDocument>();

	for (const row of rows) {
		const existing = documents.get(row.id);
		if (existing) {
			existing.gameNames.push(row.gameName);
		} else {
			documents.set(row.id, {
				id: row.id,
				gameId: row.gameId,
				title: row.title,
				gameNames: [row.gameName],
				cpus: [],
				gpus: [],
				runMetadata: []
			});
		}
	}

	const metadata = await getBenchmarkRunMetadata([...documents.keys()]);
	for (const document of documents.values()) {
		const benchmarkMetadata = metadata.get(document.id);
		document.cpus = [...(benchmarkMetadata?.cpus ?? [])];
		document.gpus = [...(benchmarkMetadata?.gpus ?? [])];
		document.runMetadata = [...(benchmarkMetadata?.searchableValues ?? [])];
	}

	return [...documents.values()];
}

function getBenchmarkListings(
	searchDocuments: Array<Pick<BenchmarkSearchDocument, 'id' | 'cpus' | 'gpus'>>
) {
	if (searchDocuments.length === 0) return [];
	const benchmarkIds = searchDocuments.map(({ id }) => id);

	const rows = db
		.select({
			id: benchmarkResult.id,
			title: benchmarkResult.title,
			createdAt: benchmarkResult.createdAt,
			username: user.username,
			gameName: gameName.name,
			coverImgId: game.coverImgId
		})
		.from(benchmarkResult)
		.innerJoin(user, eq(benchmarkResult.userId, user.id))
		.innerJoin(game, eq(benchmarkResult.gameId, game.id))
		.leftJoin(gameName, and(eq(gameName.gameId, game.id), eq(gameName.isPrimary, true)))
		.where(inArray(benchmarkResult.id, benchmarkIds))
		.all();
	const rank = new Map(benchmarkIds.map((id, position) => [id, position]));
	const metadata = new Map(searchDocuments.map((document) => [document.id, document]));

	return rows
		.sort(
			(left, right) =>
				(rank.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
				(rank.get(right.id) ?? Number.MAX_SAFE_INTEGER)
		)
		.map((benchmark) => {
			const document = metadata.get(benchmark.id);
			return {
				...benchmark,
				cpus: document?.cpus ?? [],
				gpus: document?.gpus ?? []
			};
		});
}

export async function searchBenchmarks(query: string, gameId?: number) {
	await getReadyIndex();

	const response = await index.search<BenchmarkSearchDocument>(query, {
		limit: SEARCH_LIMIT,
		attributesToRetrieve: DISPLAYED_ATTRIBUTES,
		filter: gameId === undefined ? undefined : `gameId = ${gameId}`
	});
	return getBenchmarkListings(response.hits);
}
