import { error } from '#lib/logger.js';
import { searchGames } from '#lib/server/game-search.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	try {
		const query = params.query.trim();
		if (!query) return Response.json([]);

		return Response.json(await searchGames(query));
	} catch (err) {
		error(`Failed to search games for query "${params.query}"`, err);
		return Response.json({ error: 'Game search is temporarily unavailable' }, { status: 503 });
	}
};
