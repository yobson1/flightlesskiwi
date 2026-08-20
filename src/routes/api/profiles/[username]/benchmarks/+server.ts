import { json } from '@sveltejs/kit';
import {
	getPublicBenchmarksPage,
	parsePublicBenchmarkCursor,
	parsePublicBenchmarkPage
} from '$lib/server/benchmarks';
import { getPublicProfile } from '$lib/server/profiles';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url }) => {
	const profile = getPublicProfile(params.username);
	if (!profile) return json({ message: 'Profile not found' }, { status: 404 });

	const cursor = parsePublicBenchmarkCursor(url.searchParams);
	if (cursor === false) {
		return json({ message: 'Invalid benchmark cursor' }, { status: 400 });
	}
	const page = parsePublicBenchmarkPage(url.searchParams);
	if (page === false) return json({ message: 'Invalid benchmark page' }, { status: 400 });
	if (cursor !== undefined && page !== undefined) {
		return json({ message: 'Page and cursor pagination cannot be combined' }, { status: 400 });
	}

	return json(await getPublicBenchmarksPage({ cursor, page, userId: profile.id }));
};
