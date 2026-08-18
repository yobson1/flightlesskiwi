import { error } from '@sveltejs/kit';
import { getPublicBenchmarksPage } from '$lib/server/benchmarks';
import { getPublicProfile } from '$lib/server/profiles';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const profile = getPublicProfile(params.username);
	if (!profile) error(404, 'Profile not found');

	const { id, ...publicProfile } = profile;
	return {
		profile: publicProfile,
		...(await getPublicBenchmarksPage({ userId: id }))
	};
};
