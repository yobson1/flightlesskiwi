import { error } from '@sveltejs/kit';
import { getPublicBenchmarksPage, parsePublicBenchmarkPage } from '$lib/server/benchmarks';
import { getPublicProfile } from '$lib/server/profiles';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url }) => {
	const profile = getPublicProfile(params.username);
	if (!profile) error(404, 'Profile not found');
	const page = parsePublicBenchmarkPage(url.searchParams);
	if (page === false) error(400, 'Invalid benchmark page');

	const { id, ...publicProfile } = profile;
	return {
		profile: publicProfile,
		...(await getPublicBenchmarksPage({ page, userId: id }))
	};
};
