import { json } from '@sveltejs/kit';
import { error } from '$lib/logger';
import { searchBenchmarks } from '$lib/server/benchmark-search';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	try {
		const query = params.query.trim();
		if (!query) return json([]);

		return json(await searchBenchmarks(query));
	} catch (cause) {
		error(`Failed to search benchmarks for query "${params.query}"`, cause);
		return json({ error: 'Benchmark search is temporarily unavailable' }, { status: 503 });
	}
};
