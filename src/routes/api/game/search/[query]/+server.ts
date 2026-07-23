import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { and, asc, eq, getTableColumns, like } from 'drizzle-orm';
import { error } from '$lib/logger';
import type { RequestHandler } from './$types';
import { game, gameName } from '$lib/server/db/schema';

export const GET: RequestHandler = ({ params }) => {
	try {
		const query = params.query.trim();
		if (!query) return json([]);

		const results = db
			.select({
				...getTableColumns(game),
				name: gameName.name
			})
			.from(gameName)
			.innerJoin(game, eq(gameName.gameId, game.id))
			.where(and(eq(gameName.isPrimary, true), like(gameName.name, `%${query}%`)))
			.orderBy(asc(gameName.name))
			.limit(15)
			.all();

		return json(results);
	} catch (err) {
		error(`Failed to search games for query "${params.query}": ${err}`);
		return json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
	}
};
