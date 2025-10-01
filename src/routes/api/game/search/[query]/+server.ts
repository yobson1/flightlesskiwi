import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { game, alternativeName } from '$lib/server/db/schema';
import { and, eq, exists, inArray, like, or, sql } from 'drizzle-orm';
import { error } from '$lib/logger';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	try {
		const query = params.query;
		const searchPattern = `%${query}%`;

		const results = await db.query.game.findMany({
			where: or(
				like(game.name, searchPattern),
				inArray(
					game.id,
					db
						.select({ gameId: alternativeName.gameId })
						.from(alternativeName)
						.where(like(alternativeName.name, searchPattern))
				)
			),
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
				alternativeNames: true
			},
			limit: 6
		});

		return json(results);
	} catch (err) {
		error(`Failed to search games for query "${params.query}": ${err}`);
		return json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
	}
};
