import { error, fail, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { error as logError } from '$lib/logger';
import { parseMangoHudBenchmarkData, parseMangoHudSystemInfo } from '$lib/mangohud';
import { requireVerifiedSession } from '$lib/server/auth/api';
import { deleteBenchmarkFiles, readBenchmarkFile } from '$lib/server/benchmark-files';
import { flushBenchmarkSearchQueue, queueBenchmarksForSearch } from '$lib/server/benchmark-search';
import { db } from '$lib/server/db';
import { benchmarkFile, benchmarkResult, user } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, setHeaders }) => {
	setHeaders({ 'cache-control': 'private, no-store' });

	const benchmark = db
		.select({
			id: benchmarkResult.id,
			userId: benchmarkResult.userId,
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
				const contents = await readBenchmarkFile(file.id);
				return {
					...file,
					mangoHud: parseMangoHudSystemInfo(contents),
					mangoHudData: parseMangoHudBenchmarkData(contents)
				};
			} catch (cause) {
				logError(`Failed to read benchmark file ${file.id}`, cause);
				return { ...file, mangoHud: null, mangoHudData: null };
			}
		})
	);

	const { userId, ...publicBenchmark } = benchmark;
	return {
		benchmark: publicBenchmark,
		runs,
		canDelete: locals.user?.id === userId
	};
};

export const actions: Actions = {
	delete: async (event) => {
		const authResult = requireVerifiedSession(event);
		if (authResult.response) {
			const responseData = (await authResult.response.json()) as { message?: string };
			return fail(authResult.response.status, {
				message: responseData.message ?? 'Sign in to delete this benchmark'
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
