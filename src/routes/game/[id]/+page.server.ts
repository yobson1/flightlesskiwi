import { igdb } from '$lib/server/igdb';
import type { PageServerLoad } from './$types';
import { GameSource } from '$lib/enums/igdb';

type Platform = {
	name: string;
	url: string;
	game_source: GameSource;
};

type Game = {
	name: string;
	cover_url: string;
	platforms: Platform[];
};

function constructImageUrl(imageId: string, size: ImageSize): string {
	return `https://images.igdb.com/igdb/image/upload/t_${size}/${imageId}.webp`;
}

export const load: PageServerLoad = async ({ params }) => {
	const gameID = params.id;

	try {
		const games = (await (await igdb()).fields('*').where(`id=${gameID}`).request('/games')).data;

		if (games.length === 0) {
			throw new Error('Game not found');
		}

		const covers = (
			await (await igdb()).fields('image_id').where(`id=${games[0].cover}`).request('/covers')
		).data;

		const externalGames: ExternalGame[] = (
			await (await igdb())
				.fields('*')
				.where(`id=(${games[0].external_games})`)
				.request('/external_games')
		).data;

		const pcPlatforms = externalGames.filter(
			(game) =>
				game.external_game_source === GameSource.gog ||
				game.external_game_source === GameSource.steam ||
				game.external_game_source === GameSource.itch_io ||
				game.external_game_source === GameSource.epic_game_store
		);

		const platforms: Platform[] = pcPlatforms.map((platform) => ({
			name: platform.uid,
			url: platform.url,
			game_source: platform.external_game_source
		}));

		const game: Game = {
			name: games[0].name,
			cover_url: covers[0] ? constructImageUrl(covers[0].image_id, 'cover_big') : '',
			platforms
		};

		return { game };
	} catch (error) {
		console.error('Error fetching game:', error);
		throw error;
	}
};
