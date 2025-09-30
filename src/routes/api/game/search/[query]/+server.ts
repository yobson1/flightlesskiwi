import { json } from '@sveltejs/kit';
import { igdb } from '$lib/server/igdb';
import apicalypse from 'apicalypse';
import { error } from '$lib/logger';
import type { RequestHandler } from './$types';

const FIELDS = 'name, first_release_date, cover.image_id, parent_game, version_parent';

export const GET: RequestHandler = async ({ params }) => {
	try {
		const instance = await igdb();
		const escapedQuery = params.query.replace(/"/g, '\\"');

		const searchPromise = instance.fields(FIELDS).search(escapedQuery).limit(4).request('/games');

		const multiPromise = instance
			.multi([
				apicalypse()
					.query('games', 'Exact Match')
					.fields(FIELDS)
					.where(`name ~ "${escapedQuery}"`)
					.limit(1)
					.build(),
				apicalypse()
					.query('games', 'Custom Search')
					.fields(FIELDS)
					.where(`name ~ *"${escapedQuery}"* | alternative_names.name ~ *"${escapedQuery}"*`)
					.sort('total_rating desc')
					.limit(4)
					.build()
			])
			.request('/multiquery');

		const [search, multi] = await Promise.all([searchPromise, multiPromise]);

		const exactMatch = multi.data[0].result;
		const customSearch = multi.data[1].result;

		const seen = new Set<number>();
		const deduped = [...exactMatch, ...search.data, ...customSearch].filter((item) => {
			if (seen.has(item.id)) return false;
			seen.add(item.id);
			return true;
		});

		return json(deduped);
	} catch (err) {
		error(`Failed to search games for query "${params.query}": ${err}`);
		return json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
	}
};
