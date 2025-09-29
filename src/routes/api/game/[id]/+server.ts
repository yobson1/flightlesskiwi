import { json } from '@sveltejs/kit';
import { igdb } from '$lib/server/igdb';
import { GameSource } from '$lib/enums/igdb';
import { debug, error } from '$lib/logger';
import LRUCache from '$lib/lrucache';
import type { RequestHandler } from './$types';

// each game is about 0.5-1KB in size
let gameCache: LRUCache<number, Game> = new LRUCache(1000);

function constructImageUrl(imageId: string, size: ImageSize): string {
	return `https://images.igdb.com/igdb/image/upload/t_${size}/${imageId}.webp`;
}

async function getCover(coverId: number): Promise<string> {
	if (!coverId) return '';

	const covers: IGDBCover[] = (
		await (await igdb()).fields('image_id').where(`id=${coverId}`).request('/covers')
	).data;

	return covers[0] ? constructImageUrl(covers[0].image_id, 'cover_big') : '';
}

async function getPcPlatforms(externalGameIds: number[]): Promise<Platform[]> {
	if (!externalGameIds?.length) return [];

	const externalGames: IGDBExternalGame[] = (
		await (await igdb()).fields('*').where(`id=(${externalGameIds})`).request('/external_games')
	).data;

	const pcPlatforms = externalGames.filter(
		(game) =>
			game.external_game_source === GameSource.gog ||
			game.external_game_source === GameSource.steam ||
			game.external_game_source === GameSource.itch_io ||
			game.external_game_source === GameSource.epic_game_store
	);

	return pcPlatforms.map((platform) => ({
		name: platform.uid,
		url: platform.url,
		game_source: platform.external_game_source
	}));
}

async function getInvolvedCompanies(
	involvedCompanyIds: number[]
): Promise<{ developers: Company[]; publishers: Company[] }> {
	if (!involvedCompanyIds?.length) {
		return { developers: [], publishers: [] };
	}

	const involvedCompanies: IGDBInvolvedCompany[] = (
		await (await igdb())
			.fields('company,developer,publisher')
			.where(`id=(${involvedCompanyIds})`)
			.request('/involved_companies')
	).data;

	const companyIds = [...new Set(involvedCompanies.map((ic) => ic.company))].filter(Boolean);

	if (!companyIds.length) {
		return { developers: [], publishers: [] };
	}

	const companies: IGDBCompany[] = (
		await (await igdb())
			.fields('name,websites.url')
			.where(`id=(${companyIds})`)
			.request('/companies')
	).data;

	const companyMap = new Map(companies.map((company) => [company.id, company]));

	const developers: Company[] = involvedCompanies
		.filter((ic) => ic.developer)
		.map((ic) => {
			const company = companyMap.get(ic.company);
			return {
				name: company?.name || 'Unknown',
				url: company?.websites?.[0]?.url
			};
		})
		.filter((dev) => dev.name !== 'Unknown');

	const publishers: Company[] = involvedCompanies
		.filter((ic) => ic.publisher)
		.map((ic) => {
			const company = companyMap.get(ic.company);
			return {
				name: company?.name || 'Unknown',
				url: company?.websites?.[0]?.url
			};
		})
		.filter((pub) => pub.name !== 'Unknown');

	return { developers, publishers };
}

async function getEngines(engineIds: number[]): Promise<Engine[]> {
	if (!engineIds?.length) return [];

	const engines: IGDBGameEngine[] = (
		await (await igdb()).fields('name,url').where(`id=(${engineIds})`).request('/game_engines')
	).data;

	return engines.map((engine) => ({
		name: engine.name,
		url: engine.url
	}));
}

async function fetchGame(gameID: number): Promise<Game> {
	try {
		const cachedGame = gameCache.get(gameID);
		if (cachedGame) {
			debug(`Cache hit for game ID ${gameID}`);
			return cachedGame;
		}
		debug(`Cache miss for game ID ${gameID}`);

		const games = (await (await igdb()).fields('*').where(`id=${gameID}`).request('/games')).data;

		if (games.length === 0) {
			throw new Error('Game not found');
		}

		const gameData = games[0];

		// Fetch all game details in parallel
		const [cover_url, platforms, { developers, publishers }, engines] = await Promise.all([
			getCover(gameData.cover),
			getPcPlatforms(gameData.external_games),
			getInvolvedCompanies(gameData.involved_companies),
			getEngines(gameData.game_engines)
		]);

		// Format release date if available
		const release_date = gameData.first_release_date
			? new Date(gameData.first_release_date * 1000).toDateString()
			: undefined;

		const game: Game = {
			name: gameData.name,
			cover_url,
			platforms,
			developers,
			publishers,
			engines,
			release_date
		};

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
