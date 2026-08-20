import { error } from '@sveltejs/kit';
import { SHORT_MAX_AGE } from '#lib/cache-control.js';
import {
	getPublicBenchmarksPage,
	parsePublicBenchmarkGameId,
	parsePublicBenchmarkPage
} from '#lib/server/benchmarks.js';
import { getGameSearchResult } from '#lib/server/game-search.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ setHeaders, url }) => {
	setHeaders({
		'cache-control': `private, max-age=${SHORT_MAX_AGE}, must-revalidate`,
		vary: 'cookie'
	});

	const page = parsePublicBenchmarkPage(url.searchParams);
	if (page === false) error(400, 'Invalid benchmark page');
	const gameId = parsePublicBenchmarkGameId(url.searchParams);
	if (gameId === false) error(400, 'Invalid game filter');
	const selectedGame = gameId === undefined ? null : getGameSearchResult(gameId);
	if (gameId !== undefined && selectedGame === null) error(404, 'Game not found');

	return {
		...(await getPublicBenchmarksPage({ gameId, page })),
		selectedGame
	};
};
