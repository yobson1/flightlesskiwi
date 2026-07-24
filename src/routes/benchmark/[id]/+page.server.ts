import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { benchmarkResult, user } from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
	const benchmark = db
		.select({
			id: benchmarkResult.id,
			title: benchmarkResult.title,
			description: benchmarkResult.description,
			createdAt: benchmarkResult.createdAt,
			gameId: benchmarkResult.gameId,
			username: user.username
		})
		.from(benchmarkResult)
		.innerJoin(user, eq(benchmarkResult.userId, user.id))
		.where(eq(benchmarkResult.id, params.id))
		.get();

	if (!benchmark) error(404, 'Benchmark not found');

	return { benchmark };
};
