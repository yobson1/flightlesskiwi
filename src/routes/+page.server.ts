import { getPublicBenchmarksPage } from '$lib/server/benchmarks';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	return getPublicBenchmarksPage();
};
