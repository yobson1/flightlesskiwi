import { json } from '@sveltejs/kit';
import {
	getPublicBenchmarksPage,
	parsePublicBenchmarkCursor,
	parsePublicBenchmarkGameId,
	parsePublicBenchmarkPage
} from '$lib/server/benchmarks';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const cursor = parsePublicBenchmarkCursor(url.searchParams);
	if (cursor === false) {
		return json({ message: 'Invalid benchmark cursor' }, { status: 400 });
	}
	const page = parsePublicBenchmarkPage(url.searchParams);
	if (page === false) return json({ message: 'Invalid benchmark page' }, { status: 400 });
	if (cursor !== undefined && page !== undefined) {
		return json({ message: 'Page and cursor pagination cannot be combined' }, { status: 400 });
	}
	const gameId = parsePublicBenchmarkGameId(url.searchParams);
	if (gameId === false) {
		return json({ message: 'Invalid game filter' }, { status: 400 });
	}

	return json(await getPublicBenchmarksPage({ cursor, gameId, page }));
};
