import { igdb } from '$lib/server/igdb';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const gameID = params.id;

	try {
		const gameData = (await (await igdb()).fields('*').where(`id=${gameID}`).request('/games'))
			.data;

		if (gameData.length === 0) {
			throw new Error('Game not found');
		}

		return {
			game: gameData[0]
		};
	} catch (error) {
		console.error('Error fetching game:', error);
		throw error;
	}
};
