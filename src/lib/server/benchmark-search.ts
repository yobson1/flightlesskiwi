import { getBenchmarkRunMetadata } from '$lib/server/benchmarks';
import { db } from '$lib/server/db';
import { benchmarkResult, game, gameName, user } from '$lib/server/db/schema';
import { createMeilisearchIndex, waitForMeilisearchTask } from '$lib/server/meilisearch';
import { and, count, eq, inArray } from 'drizzle-orm';

const INDEX_NAME = 'benchmarks';
const INDEX_BATCH_SIZE = 1_000;
const SEARCH_LIMIT = 100;
const INDEX_DOCUMENT_VERSION = 2;
const SEARCHABLE_ATTRIBUTES = ['title', 'gameNames', 'runMetadata'];
const DISPLAYED_ATTRIBUTES = ['id', 'cpus', 'gpus'];

interface BenchmarkSearchDocument {
	schemaVersion: number;
	id: string;
	title: string;
	gameNames: string[];
	cpus: string[];
	gpus: string[];
	runMetadata: string[];
}

const { index, ready: getReadyIndex } = createMeilisearchIndex<BenchmarkSearchDocument>({
	name: INDEX_NAME,
	searchableAttributes: SEARCHABLE_ATTRIBUTES,
	displayedAttributes: DISPLAYED_ATTRIBUTES
});

async function getSearchDocuments(benchmarkIds: string[]) {
	if (benchmarkIds.length === 0) return [];

	const rows = db
		.select({
			id: benchmarkResult.id,
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
				schemaVersion: INDEX_DOCUMENT_VERSION,
				id: row.id,
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

export async function prepareBenchmarkSearch() {
	await getReadyIndex();

	const databaseCount = db.select({ count: count() }).from(benchmarkResult).get()?.count ?? 0;
	const { numberOfDocuments } = await index.getStats();
	const indexedDocuments =
		numberOfDocuments === 0
			? []
			: (
					await index.getDocuments<Pick<BenchmarkSearchDocument, 'schemaVersion'>>({
						fields: ['schemaVersion'],
						limit: 1
					})
				).results;
	const schemaIsCurrent =
		numberOfDocuments === 0 || indexedDocuments[0]?.schemaVersion === INDEX_DOCUMENT_VERSION;
	if (databaseCount === numberOfDocuments && schemaIsCurrent) return 0;

	if (numberOfDocuments > 0) {
		await waitForMeilisearchTask(index.deleteAllDocuments());
	}
	const benchmarkIds = db.select({ id: benchmarkResult.id }).from(benchmarkResult).all();
	let indexedBenchmarks = 0;

	for (let offset = 0; offset < benchmarkIds.length; offset += INDEX_BATCH_SIZE) {
		const documents = await getSearchDocuments(
			benchmarkIds.slice(offset, offset + INDEX_BATCH_SIZE).map(({ id }) => id)
		);
		if (documents.length > 0) {
			await waitForMeilisearchTask(index.addDocuments(documents, { primaryKey: 'id' }));
			indexedBenchmarks += documents.length;
		}
	}

	return indexedBenchmarks;
}

export async function indexBenchmarks(benchmarkIds: string[]) {
	if (benchmarkIds.length === 0) return;
	await getReadyIndex();

	const documents = await getSearchDocuments(benchmarkIds);
	if (documents.length > 0) {
		await waitForMeilisearchTask(index.addDocuments(documents, { primaryKey: 'id' }));
	}
}

export async function removeBenchmarksFromSearch(benchmarkIds: string[]) {
	if (benchmarkIds.length === 0) return;
	await getReadyIndex();
	await waitForMeilisearchTask(index.deleteDocuments(benchmarkIds));
}

export async function searchBenchmarks(query: string) {
	await getReadyIndex();

	const response = await index.search<BenchmarkSearchDocument>(query, {
		limit: SEARCH_LIMIT,
		attributesToRetrieve: DISPLAYED_ATTRIBUTES
	});
	return getBenchmarkListings(response.hits);
}
