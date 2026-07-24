import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { error as logError } from '$lib/logger';
import { parseMangoHudBenchmarkData, parseMangoHudSystemInfo } from '$lib/mangohud';
import { readBenchmarkFile } from '$lib/server/benchmark-files';
import { db } from '$lib/server/db';
import { benchmarkFile, benchmarkResult, user } from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
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

	return { benchmark, runs };
};
