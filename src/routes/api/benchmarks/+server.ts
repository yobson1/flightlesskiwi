import { json } from '@sveltejs/kit';
import { getPublicBenchmarksPage, parsePublicBenchmarkCursor } from '$lib/server/benchmarks';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const cursor = parsePublicBenchmarkCursor(url.searchParams);
	if (cursor === false) {
		return json({ message: 'Invalid benchmark cursor' }, { status: 400 });
	}
	const gameId = parseGameId(url.searchParams);
	if (gameId === false) {
		return json({ message: 'Invalid game filter' }, { status: 400 });
	}

	return json(await getPublicBenchmarksPage({ cursor, gameId }));
};

function parseGameId(searchParams: URLSearchParams): number | undefined | false {
	const value = searchParams.get('game_id');
	if (value === null) return undefined;

	const gameId = Number(value);
	return Number.isSafeInteger(gameId) && gameId > 0 ? gameId : false;
}
