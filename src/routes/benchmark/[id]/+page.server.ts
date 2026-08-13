import { error, fail, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { error as logError } from '$lib/logger';
import { requireVerifiedSession } from '$lib/server/auth/api';
import { deleteBenchmarkFiles } from '$lib/server/benchmark-files';
import { parseBenchmarkRun } from '$lib/server/benchmark-run';
import { flushBenchmarkSearchQueue, queueBenchmarksForSearch } from '$lib/server/benchmark-search';
import { db } from '$lib/server/db';
import { benchmarkFile, benchmarkResult, game, gameName, user } from '$lib/server/db/schema';
import { getMessage } from '$lib/utils';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, setHeaders, url }) => {
	setHeaders({ 'cache-control': 'private, no-store' });

	const benchmark = db
		.select({
			id: benchmarkResult.id,
			userId: benchmarkResult.userId,
			title: benchmarkResult.title,
			description: benchmarkResult.description,
			createdAt: benchmarkResult.createdAt,
			gameId: benchmarkResult.gameId,
			username: user.username,
			gameName: gameName.name,
			coverImgId: game.coverImgId
		})
		.from(benchmarkResult)
		.innerJoin(user, eq(benchmarkResult.userId, user.id))
		.innerJoin(game, eq(benchmarkResult.gameId, game.id))
		.leftJoin(gameName, and(eq(gameName.gameId, game.id), eq(gameName.isPrimary, true)))
		.where(eq(benchmarkResult.id, params.id))
		.get();

	if (!benchmark) error(404, 'Benchmark not found');

	const files = db
		.select({
			id: benchmarkFile.id,
			originalName: benchmarkFile.originalName
		})
		.from(benchmarkFile)
		.where(eq(benchmarkFile.benchmarkId, benchmark.id))
		.orderBy(benchmarkFile.originalName)
		.all();

	const runs = await Promise.all(
		files.map(async (file) => {
			try {
				const benchmarkRun = await parseBenchmarkRun({
					fileId: file.id,
					label: file.originalName
				});
				return {
					...file,
					benchmarkRun
				};
			} catch (cause) {
				logError(`Failed to read benchmark file ${file.id}`, cause);
				return { ...file, benchmarkRun: null };
			}
		})
	);

	const { userId, ...publicBenchmark } = benchmark;
	return {
		benchmark: publicBenchmark,
		runs,
		canDelete: locals.user?.id === userId,
		canonicalUrl: new URL(url.pathname, url.origin).href
	};
};

export const actions: Actions = {
	delete: async (event) => {
		const authResult = requireVerifiedSession(event);
		if (authResult.response) {
			return fail(authResult.response.status, {
				message: getMessage(await authResult.response.json(), 'Sign in to delete this benchmark')
			});
		}

		const benchmark = db
			.select({ userId: benchmarkResult.userId })
			.from(benchmarkResult)
			.where(eq(benchmarkResult.id, event.params.id))
			.get();
		if (!benchmark) return fail(404, { message: 'Benchmark not found' });
		if (benchmark.userId !== authResult.authenticated.user.id) {
			return fail(403, { message: 'You can only delete your own benchmarks' });
		}

		const fileIds = db
			.select({ id: benchmarkFile.id })
			.from(benchmarkFile)
			.where(eq(benchmarkFile.benchmarkId, event.params.id))
			.all()
			.map(({ id }) => id);

		try {
			const deleted = db.transaction((tx) => {
				const result = tx
					.delete(benchmarkResult)
					.where(
						and(
							eq(benchmarkResult.id, event.params.id),
							eq(benchmarkResult.userId, authResult.authenticated.user.id)
						)
					)
					.returning({ id: benchmarkResult.id })
					.get();
				if (result) queueBenchmarksForSearch([result.id], tx);
				return result;
			});
			if (!deleted) return fail(404, { message: 'Benchmark not found' });
		} catch (cause) {
			logError(`Failed to delete benchmark ${event.params.id}`, cause);
			return fail(500, { message: 'The benchmark could not be deleted. Please try again.' });
		}

		try {
			await deleteBenchmarkFiles(fileIds);
		} catch (cause) {
			logError(`Failed to clean up files for deleted benchmark ${event.params.id}`, cause);
		}
		try {
			await flushBenchmarkSearchQueue();
		} catch (cause) {
			logError(`Failed to remove deleted benchmark ${event.params.id} from search`, cause);
		}

		redirect(303, '/');
	}
};
