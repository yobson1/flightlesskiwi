import { env } from '$env/dynamic/private';
import {
	ErrorStatusCode,
	Meilisearch,
	MeilisearchApiError,
	type EnqueuedTaskPromise,
	type RecordAny
} from 'meilisearch';

const TASK_TIMEOUT_MS = 300_000;

const client = new Meilisearch({
	host: env.MEILI_HOST || 'http://localhost:7700',
	apiKey: env.MEILI_MASTER_KEY || undefined,
	timeout: 5_000
});

interface MeilisearchIndexOptions {
	name: string;
	primaryKey?: string;
	searchableAttributes: string[];
	displayedAttributes: string[];
}

export function createMeilisearchIndex<Document extends RecordAny>({
	name,
	primaryKey = 'id',
	searchableAttributes,
	displayedAttributes
}: MeilisearchIndexOptions) {
	const index = client.index<Document>(name);
	let readyPromise: Promise<void> | undefined;

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

	return { index, ready };
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
