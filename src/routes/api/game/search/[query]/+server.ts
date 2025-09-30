import { json } from '@sveltejs/kit';
import { igdb } from '$lib/server/igdb';
import apicalypse from 'apicalypse';
import type { RequestHandler } from './$types';

const FIELDS = 'name, first_release_date, cover.image_id';
export const GET: RequestHandler = async ({ params }) => {
	const [searchInstance, multiInstance] = await Promise.all([igdb(), igdb()]);

	const [search, multi] = await Promise.all([
		searchInstance.fields(FIELDS).search(params.query).limit(4).request('/games'),
		multiInstance
			.multi([
				apicalypse()
					.query('games', 'Custom Search')
					.fields(FIELDS)
					.where(
						`name ~ *"${params.query}"* | alternative_names.name ~ *"${params.query}"* | name = "${params.query}"`
					)
					.sort('total_rating desc')
					.limit(4)
					.build(),
				apicalypse()
					.query('games', 'Exact Match')
					.fields(FIELDS)
					.where(`name ~ "${params.query}"`)
					.limit(1)
					.build()
			])
			.request('/multiquery')
	]);
	const customSearch = multi.data[0].result;
	const exactMatch = multi.data[1].result;

	const seen = new Set<number>();
	const deduped = [...exactMatch, ...search.data, ...customSearch].filter((item) => {
		if (seen.has(item.id)) return false;
		seen.add(item.id);
		return true;
	});

	return json(deduped);
};
