import { json } from '@sveltejs/kit';
import { igdb } from '$lib/server/igdb';
import { debug, error } from '$lib/logger';
import LRUCache from '$lib/lrucache';
import type { RequestHandler } from './$types';
import type { Game } from '$lib/types/igdb';

// each game is about 0.5-1KB in size
let gameCache: LRUCache<number, Game> = new LRUCache(1000);

async function fetchGame(gameID: number): Promise<Game> {
	try {
		const cachedGame = gameCache.get(gameID);
		if (cachedGame) {
			debug(`Cache hit for game ID ${gameID}`);
			return cachedGame;
		}
		debug(`Cache miss for game ID ${gameID}`);

		const games: Game[] = (
			await (await igdb())
				.fields(
					'name, first_release_date, cover.image_id, external_games.external_game_source, external_games.url, involved_companies.developer, involved_companies.publisher, involved_companies.company.name, involved_companies.company.websites.url, game_engines.name, game_engines.url'
				)
				.where(`id = ${gameID}`)
				.limit(1)
				.request('/games')
		).data;

		if (games.length === 0) {
			throw new Error('Game not found');
		}

		const game = games[0];
		const sizeInBytes = new Blob([JSON.stringify(game)]).size;
		const sizeInKB = (sizeInBytes / 1024).toFixed(2);
		debug(`Game data for ID ${gameID}: ${JSON.stringify(game)}`);
		debug(`Size of game data for ID ${gameID}: ${sizeInKB}KB`);

		gameCache.set(gameID, game);
		return game;
	} catch (err) {
		error('Error fetching game:', err);
		throw err;
	}
}

export const GET: RequestHandler = async ({ params }) => {
	const gameID = Number(params.id);

	if (!gameID) {
		return json({ error: 'Game ID is required' }, { status: 400 });
	}

	try {
		const game = await fetchGame(gameID);
		return json(game);
	} catch (err) {
		return json({ error: err instanceof Error ? err.message : 'Game not found' }, { status: 404 });
	}
};
