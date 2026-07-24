import { and, asc, desc, eq, inArray, lt, or } from 'drizzle-orm';
import { parseMangoHudSystemInfo } from '$lib/mangohud';
import { readBenchmarkFilePrefix } from '$lib/server/benchmark-files';
import { db } from '$lib/server/db';
import { benchmarkFile, benchmarkResult, game, gameName, user } from '$lib/server/db/schema';

export const PUBLIC_BENCHMARK_PAGE_SIZE = 30;

export interface PublicBenchmarkCursor {
	createdAt: number;
	id: string;
}

export async function getBenchmarkHardwareNames(benchmarkIds: string[]) {
	const hardwareNames = new Map<string, { cpus: Set<string>; gpus: Set<string> }>();
	if (benchmarkIds.length === 0) return hardwareNames;

	const files = db
		.select({
			id: benchmarkFile.id,
			benchmarkId: benchmarkFile.benchmarkId
		})
		.from(benchmarkFile)
		.where(inArray(benchmarkFile.benchmarkId, benchmarkIds))
		.orderBy(asc(benchmarkFile.benchmarkId), asc(benchmarkFile.originalName))
		.all();

	const parsedFiles = await Promise.all(
		files.map(async (file) => {
			try {
				const contents = await readBenchmarkFilePrefix(file.id);
				const systemInfo = parseMangoHudSystemInfo(contents);
				const cpu = systemInfo?.cpu.trim();
				const gpu = systemInfo?.gpu.trim();
				return cpu || gpu ? { benchmarkId: file.benchmarkId, cpu, gpu } : null;
			} catch {
				// A missing or unreadable upload should not prevent the benchmark listing from loading.
				return null;
			}
		})
	);

	for (const parsedFile of parsedFiles) {
		if (!parsedFile) continue;
		const names = hardwareNames.get(parsedFile.benchmarkId) ?? {
			cpus: new Set<string>(),
			gpus: new Set<string>()
		};
		if (parsedFile.cpu) names.cpus.add(parsedFile.cpu);
		if (parsedFile.gpu) names.gpus.add(parsedFile.gpu);
		hardwareNames.set(parsedFile.benchmarkId, names);
	}

	return hardwareNames;
}

export async function getPublicBenchmarksPage(cursor?: PublicBenchmarkCursor) {
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
	const pageRows = hasMore ? rows.slice(0, PUBLIC_BENCHMARK_PAGE_SIZE) : rows;
	const hardwareNames = await getBenchmarkHardwareNames(pageRows.map(({ id }) => id));
	const benchmarks = pageRows.map((benchmark) => {
		const hardware = hardwareNames.get(benchmark.id);
		return {
			...benchmark,
			cpus: [...(hardware?.cpus ?? [])],
			gpus: [...(hardware?.gpus ?? [])]
		};
	});
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
