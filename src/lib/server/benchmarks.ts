import { and, desc, eq, lt, or } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { benchmarkResult, game, gameName, user } from '$lib/server/db/schema';

export const PUBLIC_BENCHMARK_PAGE_SIZE = 30;

export interface PublicBenchmarkCursor {
	createdAt: number;
	id: string;
}

export function getPublicBenchmarksPage(cursor?: PublicBenchmarkCursor) {
	const cursorCondition = cursor
		? or(
				lt(benchmarkResult.createdAt, new Date(cursor.createdAt)),
				and(
					eq(benchmarkResult.createdAt, new Date(cursor.createdAt)),
					lt(benchmarkResult.id, cursor.id)
				)
			)
		: undefined;

	const rows = db
		.select({
			id: benchmarkResult.id,
			title: benchmarkResult.title,
			description: benchmarkResult.description,
			createdAt: benchmarkResult.createdAt,
			username: user.username,
			gameName: gameName.name,
			coverImgId: game.coverImgId
		})
		.from(benchmarkResult)
		.innerJoin(user, eq(benchmarkResult.userId, user.id))
		.innerJoin(game, eq(benchmarkResult.gameId, game.id))
		.leftJoin(gameName, and(eq(gameName.gameId, game.id), eq(gameName.isPrimary, true)))
		.where(cursorCondition)
		.orderBy(desc(benchmarkResult.createdAt), desc(benchmarkResult.id))
		.limit(PUBLIC_BENCHMARK_PAGE_SIZE + 1)
		.all();

	const hasMore = rows.length > PUBLIC_BENCHMARK_PAGE_SIZE;
	const benchmarks = hasMore ? rows.slice(0, PUBLIC_BENCHMARK_PAGE_SIZE) : rows;
	const lastBenchmark = benchmarks.at(-1);

	return {
		benchmarks,
		nextCursor:
			hasMore && lastBenchmark
				? {
						createdAt: lastBenchmark.createdAt.getTime(),
						id: lastBenchmark.id
					}
				: null
	};
}
