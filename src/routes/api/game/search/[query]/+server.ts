import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { sql } from 'drizzle-orm';
import { error } from '$lib/logger';
import type { RequestHandler } from './$types';
import type { GameSearchResult } from '$lib/types/igdb';

export const GET: RequestHandler = async ({ params }) => {
	try {
		const words = params.query.trim().split(/\s+/);
		// treat each word as a prefix or exact match
		// `kingdom come deliverance` becomes `"kingdom"* OR "kingdom" "come"* OR "come" "deliverance"* OR "deliverance"`
		const searchTerm = words
			.map((word) => {
				const escaped = word.replace(/"/g, '""');
				return `"${escaped}"* OR "${escaped}"`;
			})
			.join(' ');

		const results: GameSearchResult[] = db.all(sql`
		WITH best_matches AS (
			SELECT
				gn.id,
				gn.game_id,
				gn.name as matched_name,
				gn.is_primary as matched_is_primary,
				fts.rank,
				ROW_NUMBER() OVER (PARTITION BY gn.game_id ORDER BY fts.rank) as rn
			FROM game_name_fts fts
			JOIN game_name gn ON gn.id = fts.rowid
			WHERE game_name_fts MATCH ${searchTerm}
		)
		SELECT
			g.*,
			bm.matched_name,
			bm.matched_is_primary,
			bm.rank as relevancy,
			primary_gn.name as name
		FROM best_matches bm
		JOIN game g ON g.id = bm.game_id
		LEFT JOIN game_name primary_gn ON primary_gn.game_id = g.id AND primary_gn.is_primary = 1
		WHERE bm.rn = 1
		ORDER BY bm.rank
		LIMIT 15`);

		return json(results);
	} catch (err) {
		error(`Failed to search games for query "${params.query}": ${err}`);
		return json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
	}
};
