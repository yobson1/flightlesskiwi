import { SHORT_MAX_AGE } from '#lib/cache-control.js';
import {
	getPublicBenchmarksPage,
	parsePublicBenchmarkCursor,
	parsePublicBenchmarkGameId,
	parsePublicBenchmarkPage
} from '#lib/server/benchmarks.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const cursor = parsePublicBenchmarkCursor(url.searchParams);
	if (cursor === false) {
		return Response.json({ message: 'Invalid benchmark cursor' }, { status: 400 });
	}
	const page = parsePublicBenchmarkPage(url.searchParams);
	if (page === false) return Response.json({ message: 'Invalid benchmark page' }, { status: 400 });
	if (cursor !== undefined && page !== undefined) {
		return Response.json(
			{ message: 'Page and cursor pagination cannot be combined' },
			{ status: 400 }
		);
	}
	const gameId = parsePublicBenchmarkGameId(url.searchParams);
	if (gameId === false) {
		return Response.json({ message: 'Invalid game filter' }, { status: 400 });
	}

	return Response.json(await getPublicBenchmarksPage({ cursor, gameId, page }), {
		headers: {
			'cache-control': `private, max-age=${SHORT_MAX_AGE}, must-revalidate`
		}
	});
};
