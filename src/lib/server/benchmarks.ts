import { and, asc, desc, eq, inArray, lt, or } from 'drizzle-orm';
import { parseBenchmarkSystemInfo } from '$lib/benchmark-run';
import { readBenchmarkFilePrefix } from '$lib/server/benchmark-files';
import { db } from '$lib/server/db';
import { benchmarkFile, benchmarkResult, game, gameName, user } from '$lib/server/db/schema';

export const PUBLIC_BENCHMARK_PAGE_SIZE = 30;

export interface PublicBenchmarkCursor {
	createdAt: number;
	id: string;
}

export interface BenchmarkRunMetadata {
	cpus: Set<string>;
	gpus: Set<string>;
	searchableValues: Set<string>;
}

export async function getBenchmarkRunMetadata(benchmarkIds: string[]) {
	const benchmarkMetadata = new Map<string, BenchmarkRunMetadata>();
	if (benchmarkIds.length === 0) return benchmarkMetadata;

	const files = db
		.select({
			id: benchmarkFile.id,
			benchmarkId: benchmarkFile.benchmarkId,
			originalName: benchmarkFile.originalName
		})
		.from(benchmarkFile)
		.where(inArray(benchmarkFile.benchmarkId, benchmarkIds))
		.orderBy(asc(benchmarkFile.benchmarkId), asc(benchmarkFile.originalName))
		.all();

	const parsedFiles = await Promise.all(
		files.map(async (file) => {
			try {
				const contents = await readBenchmarkFilePrefix(file.id);
				const systemInfo = parseBenchmarkSystemInfo(contents);
				return { ...file, systemInfo };
			} catch {
				// A missing or unreadable upload should not prevent the benchmark listing from loading.
				return { ...file, systemInfo: null };
			}
		})
	);

	for (const parsedFile of parsedFiles) {
		const metadata = benchmarkMetadata.get(parsedFile.benchmarkId) ?? {
			cpus: new Set<string>(),
			gpus: new Set<string>(),
			searchableValues: new Set<string>()
		};
		const { systemInfo } = parsedFile;
		metadata.searchableValues.add(parsedFile.originalName);
		if (!systemInfo) {
			benchmarkMetadata.set(parsedFile.benchmarkId, metadata);
			continue;
		}

		const cpu = systemInfo.cpu.trim();
		const gpu = systemInfo.gpu.trim();
		if (cpu) metadata.cpus.add(cpu);
		if (gpu) metadata.gpus.add(gpu);

		const ram =
			systemInfo.ramBytes === null
				? ''
				: `${(systemInfo.ramBytes / 1024 ** 3).toFixed(1).replace(/\.0$/, '')} GiB`;
		for (const value of [
			systemInfo.os,
			cpu,
			gpu,
			ram,
			systemInfo.ramDescription,
			systemInfo.kernel,
			systemInfo.driver,
			systemInfo.cpuScheduler,
			systemInfo.motherboard
		]) {
			const normalized = value.trim();
			if (normalized) metadata.searchableValues.add(normalized);
		}
		benchmarkMetadata.set(parsedFile.benchmarkId, metadata);
	}

	return benchmarkMetadata;
}

export async function getPublicBenchmarksPage(cursor?: PublicBenchmarkCursor, gameId?: number) {
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
		.where(
			and(cursorCondition, gameId === undefined ? undefined : eq(benchmarkResult.gameId, gameId))
		)
		.orderBy(desc(benchmarkResult.createdAt), desc(benchmarkResult.id))
		.limit(PUBLIC_BENCHMARK_PAGE_SIZE + 1)
		.all();

	const hasMore = rows.length > PUBLIC_BENCHMARK_PAGE_SIZE;
	const pageRows = hasMore ? rows.slice(0, PUBLIC_BENCHMARK_PAGE_SIZE) : rows;
	const runMetadata = await getBenchmarkRunMetadata(pageRows.map(({ id }) => id));
	const benchmarks = pageRows.map((benchmark) => {
		const metadata = runMetadata.get(benchmark.id);
		return {
			...benchmark,
			cpus: [...(metadata?.cpus ?? [])],
			gpus: [...(metadata?.gpus ?? [])]
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
