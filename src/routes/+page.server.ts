import { error } from '@sveltejs/kit';
import {
	getPublicBenchmarksPage,
	parsePublicBenchmarkGameId,
	parsePublicBenchmarkPage
} from '$lib/server/benchmarks';
import { getGameSearchResult } from '$lib/server/game-search';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
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
