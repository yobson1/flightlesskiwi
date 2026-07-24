import { json } from '@sveltejs/kit';
import { getPublicBenchmarksPage, type PublicBenchmarkCursor } from '$lib/server/benchmarks';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) => {
	const cursor = parseCursor(url.searchParams);
	if (cursor === false) {
		return json({ message: 'Invalid benchmark cursor' }, { status: 400 });
	}

	return json(getPublicBenchmarksPage(cursor));
};

function parseCursor(searchParams: URLSearchParams): PublicBenchmarkCursor | undefined | false {
	const createdAtValue = searchParams.get('before');
	const id = searchParams.get('before_id');
	if (createdAtValue === null && id === null) return undefined;
	if (createdAtValue === null || id === null) return false;

	const createdAt = Number(createdAtValue);
	if (!Number.isSafeInteger(createdAt) || createdAt <= 0 || id.length === 0 || id.length > 100) {
		return false;
	}

	return { createdAt, id };
}
