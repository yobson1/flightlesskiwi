import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { searchIndexQueue } from '$lib/server/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import {
	ErrorStatusCode,
	Meilisearch,
	MeilisearchApiError,
	type EnqueuedTaskPromise,
	type RecordAny
} from 'meilisearch';

const TASK_TIMEOUT_MS = 300_000;
const INDEX_BATCH_SIZE = 1_000;

const client = new Meilisearch({
	host: env.MEILI_HOST || 'http://localhost:7700',
	apiKey: env.MEILI_MASTER_KEY || undefined,
	timeout: 5_000
});

type DocumentId = string | number;
type SearchQueueDatabase = Pick<typeof db, 'insert'>;
type VersionedDocument<Document> = Document & { schemaVersion: number };

interface MeilisearchIndexOptions<Document extends RecordAny, Id extends DocumentId> {
	name: string;
	primaryKey?: string;
	searchableAttributes: string[];
	displayedAttributes: string[];
	documentVersion: number;
	getAllDocumentIds: () => Id[] | Promise<Id[]>;
	getDocuments: (documentIds: Id[]) => Document[] | Promise<Document[]>;
	parseDocumentId: (documentId: string) => Id;
}

export function createMeilisearchIndex<Document extends RecordAny, Id extends DocumentId>({
	name,
	primaryKey = 'id',
	searchableAttributes,
	displayedAttributes,
	documentVersion,
	getAllDocumentIds,
	getDocuments,
	parseDocumentId
}: MeilisearchIndexOptions<Document, Id>) {
	const index = client.index<VersionedDocument<Document>>(name);
	let readyPromise: Promise<void> | undefined;
	let flushPromise: Promise<number> | undefined;

	async function ensureIndex() {
		let existingPrimaryKey: string | undefined;

		try {
			existingPrimaryKey = (await client.getRawIndex(name)).primaryKey;
		} catch (cause) {
			if (!isMissingIndex(cause)) throw cause;
			await waitForMeilisearchTask(client.createIndex(name, { primaryKey }));
			existingPrimaryKey = primaryKey;
		}

		if (existingPrimaryKey !== primaryKey) {
			throw new Error(`Meilisearch index "${name}" must use "${primaryKey}" as its primary key`);
		}

		const settings = await index.getSettings();
		if (
			!arraysEqual(settings.searchableAttributes, searchableAttributes) ||
			!arraysEqual(settings.displayedAttributes, displayedAttributes)
		) {
			await waitForMeilisearchTask(
				index.updateSettings({
					searchableAttributes,
					displayedAttributes
				})
			);
		}
	}

	function ready() {
		if (readyPromise) return readyPromise;

		const preparation = ensureIndex().catch((cause) => {
			if (readyPromise === preparation) readyPromise = undefined;
			throw cause;
		});
		readyPromise = preparation;
		return preparation;
	}

	function queue(documentIds: Id[], database: SearchQueueDatabase = db) {
		for (const ids of chunks(documentIds)) {
			if (ids.length === 0) continue;
			database
				.insert(searchIndexQueue)
				.values(
					ids.map((documentId) => ({
						indexName: name,
						documentId: String(documentId)
					}))
				)
				.onConflictDoUpdate({
					target: [searchIndexQueue.indexName, searchIndexQueue.documentId],
					set: { revision: sql`${searchIndexQueue.revision} + 1` }
				})
				.run();
		}
	}

	async function reconcile() {
		await ready();

		const databaseIds = await getAllDocumentIds();
		const databaseIdSet = new Set(databaseIds.map(String));
		const indexedIds: Id[] = [];
		let needsReindex = false;
		let offset = 0;

		while (true) {
			const response = await index.getDocuments<Record<string, unknown>>({
				fields: [primaryKey, 'schemaVersion'],
				limit: INDEX_BATCH_SIZE,
				offset
			});

			for (const document of response.results) {
				const rawDocumentId = document[primaryKey];
				if (
					(typeof rawDocumentId !== 'string' && typeof rawDocumentId !== 'number') ||
					typeof document.schemaVersion !== 'number'
				) {
					needsReindex = true;
					continue;
				}

				const documentId = parseDocumentId(String(rawDocumentId));
				indexedIds.push(documentId);
				if (document.schemaVersion !== documentVersion || !databaseIdSet.has(String(documentId))) {
					needsReindex = true;
				}
			}

			if (response.results.length < INDEX_BATCH_SIZE) break;
			offset += response.results.length;
		}

		if (indexedIds.length !== databaseIds.length) needsReindex = true;
		if (needsReindex) {
			const documentIds = new Map<string, Id>();
			for (const documentId of [...databaseIds, ...indexedIds]) {
				documentIds.set(String(documentId), documentId);
			}
			queue([...documentIds.values()]);
		}
	}

	async function runFlush() {
		await ready();
		let indexedDocuments = 0;

		while (true) {
			const queuedDocuments = db
				.select({
					documentId: searchIndexQueue.documentId,
					revision: searchIndexQueue.revision
				})
				.from(searchIndexQueue)
				.where(eq(searchIndexQueue.indexName, name))
				.limit(INDEX_BATCH_SIZE)
				.all();
			if (queuedDocuments.length === 0) return indexedDocuments;

			const documentIds = queuedDocuments.map(({ documentId }) => parseDocumentId(documentId));
			const documents = await getDocuments(documentIds);
			const existingDocumentIds = new Set(
				documents.map((document) => String(document[primaryKey]))
			);
			const deletedDocumentIds = documentIds.filter(
				(documentId) => !existingDocumentIds.has(String(documentId))
			);

			if (documents.length > 0) {
				const versionedDocuments = documents.map((document) => ({
					...document,
					schemaVersion: documentVersion
				}));
				await waitForMeilisearchTask(index.addDocuments(versionedDocuments, { primaryKey }));
				indexedDocuments += documents.length;
			}
			if (deletedDocumentIds.length > 0) {
				await waitForMeilisearchTask(index.deleteDocuments(deletedDocumentIds.map(String)));
			}

			db.transaction((tx) => {
				for (const queuedDocument of queuedDocuments) {
					tx.delete(searchIndexQueue)
						.where(
							and(
								eq(searchIndexQueue.indexName, name),
								eq(searchIndexQueue.documentId, queuedDocument.documentId),
								eq(searchIndexQueue.revision, queuedDocument.revision)
							)
						)
						.run();
				}
			});
		}
	}

	function flush() {
		if (flushPromise) return flushPromise;

		const flushing = runFlush().finally(() => {
			if (flushPromise === flushing) flushPromise = undefined;
		});
		flushPromise = flushing;
		return flushing;
	}

	async function prepare() {
		await reconcile();
		return flush();
	}

	return { index, ready, queue, flush, prepare };
}

export async function waitForMeilisearchTask(task: EnqueuedTaskPromise) {
	const result = await task.waitTask({ timeout: TASK_TIMEOUT_MS });
	if (result.status !== 'succeeded') {
		throw new Error(
			`Meilisearch task ${result.uid} ${result.status}: ${result.error?.message ?? 'unknown error'}`
		);
	}
	return result;
}

function isMissingIndex(cause: unknown) {
	return (
		cause instanceof MeilisearchApiError && cause.cause?.code === ErrorStatusCode.INDEX_NOT_FOUND
	);
}

function arraysEqual(left: string[] | null | undefined, right: string[]) {
	if (!left) return false;
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function* chunks<Id>(items: Id[]) {
	for (let index = 0; index < items.length; index += INDEX_BATCH_SIZE) {
		yield items.slice(index, index + INDEX_BATCH_SIZE);
	}
}
