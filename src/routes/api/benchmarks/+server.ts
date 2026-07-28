import { json } from '@sveltejs/kit';
import { getPublicBenchmarksPage, type PublicBenchmarkCursor } from '$lib/server/benchmarks';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const cursor = parseCursor(url.searchParams);
	if (cursor === false) {
		return json({ message: 'Invalid benchmark cursor' }, { status: 400 });
	}
	const gameId = parseGameId(url.searchParams);
	if (gameId === false) {
		return json({ message: 'Invalid game filter' }, { status: 400 });
	}

	return json(await getPublicBenchmarksPage(cursor, gameId));
};

function parseCursor(searchParams: URLSearchParams): PublicBenchmarkCursor | undefined | false {
	const createdAtValue = searchParams.get('before');
	const id = searchParams.get('before_id');
	if (createdAtValue === null && id === null) return undefined;
	if (createdAtValue === null || id === null) return false;

	const createdAt = Number(createdAtValue);
	if (!Number.isSafeInteger(createdAt) || createdAt <= 0 || id.length === 0 || id.length > 100) {
		return false;
	}

	return { createdAt, id };
}

function parseGameId(searchParams: URLSearchParams): number | undefined | false {
	const value = searchParams.get('game_id');
	if (value === null) return undefined;

	const gameId = Number(value);
	return Number.isSafeInteger(gameId) && gameId > 0 ? gameId : false;
}
