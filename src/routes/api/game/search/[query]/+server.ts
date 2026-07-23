import { json } from '@sveltejs/kit';
import { error } from '$lib/logger';
import { searchGames } from '$lib/server/game-search';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	try {
		const query = params.query.trim();
		if (!query) return json([]);

		return json(await searchGames(query));
	} catch (err) {
		error(`Failed to search games for query "${params.query}"`, err);
		return json({ error: 'Game search is temporarily unavailable' }, { status: 503 });
	}
};
