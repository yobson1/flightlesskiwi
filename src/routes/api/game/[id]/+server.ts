import { debug, error } from '#lib/logger.js';
import { db } from '#lib/server/db/index.js';
import LRUCache from '#lib/lrucache.js';
import type { RequestHandler } from './$types';
import type { FullGame } from '#lib/server/db/schema.js';

// each game is about 0.5-2KB in size
const gameCache = new LRUCache<number, FullGame>(1000);

export const GET: RequestHandler = ({ params }) => {
	const gameID = Number(params.id);

	if (!gameID) {
		return Response.json({ error: 'Game ID is required' }, { status: 400 });
	}

	try {
		const cachedGame = gameCache.get(gameID);
		if (cachedGame) {
			debug(`Cache hit for game ID ${gameID}`);
			return Response.json(cachedGame);
		}
		debug(`Cache miss for game ID ${gameID}`);

		const gameResult = db.query.game
			.findFirst({
				where: (game, { eq }) => eq(game.id, gameID),
				with: {
					storeLinks: {
						with: {
							store: true
						}
					},
					involvedCompanies: {
						with: {
							company: true
						}
					},
					usedEngines: {
						with: {
							engine: true
						}
					},
					names: {
						where: (gameName, { eq }) => eq(gameName.isPrimary, true),
						limit: 1
					}
				}
			})
			.sync();

		if (!gameResult) {
			return Response.json({ error: 'Game not found' }, { status: 404 });
		}

		const sizeInBytes = new Blob([JSON.stringify(gameResult)]).size;
		const sizeInKB = (sizeInBytes / 1024).toFixed(2);
		debug(`Game data for ID ${gameID}: ${JSON.stringify(gameResult)}`);
		debug(`Size of game data for ID ${gameID}: ${sizeInKB}KB`);

		gameCache.set(gameID, gameResult);
		return Response.json(gameResult);
	} catch (err) {
		error(`Failed to fetch game ID ${gameID}:`, err);
		return Response.json(
			{ error: err instanceof Error ? err.message : String(err) },
			{ status: 500 }
		);
	}
};
