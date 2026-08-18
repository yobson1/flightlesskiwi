import { json } from '@sveltejs/kit';
import { getPublicBenchmarksPage, parsePublicBenchmarkCursor } from '$lib/server/benchmarks';
import { getPublicProfile } from '$lib/server/profiles';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url }) => {
	const profile = getPublicProfile(params.username);
	if (!profile) return json({ message: 'Profile not found' }, { status: 404 });

	const cursor = parsePublicBenchmarkCursor(url.searchParams);
	if (cursor === false) {
		return json({ message: 'Invalid benchmark cursor' }, { status: 400 });
	}

	return json(await getPublicBenchmarksPage({ cursor, userId: profile.id }));
};
