import { error } from '#lib/logger.js';
import { searchBenchmarks } from '#lib/server/benchmark-search.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url }) => {
	try {
		const query = params.query.trim();
		if (!query) return Response.json([]);
		const gameIdValue = url.searchParams.get('game_id');
		const gameId = gameIdValue === null ? undefined : Number(gameIdValue);
		if (gameId !== undefined && (!Number.isSafeInteger(gameId) || gameId <= 0)) {
			return Response.json({ error: 'Invalid game filter' }, { status: 400 });
		}

		return Response.json(await searchBenchmarks(query, gameId));
	} catch (cause) {
		error(`Failed to search benchmarks for query "${params.query}"`, cause);
		return Response.json({ error: 'Benchmark search is temporarily unavailable' }, { status: 503 });
	}
};
