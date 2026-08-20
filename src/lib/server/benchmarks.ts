import { and, asc, count, desc, eq, inArray, lt, or } from 'drizzle-orm';
import { parseBenchmarkSystemInfo } from '$lib/benchmark-run';
import { readBenchmarkFilePrefix } from '$lib/server/benchmark-files';
import { db } from '$lib/server/db';
import { benchmarkFile, benchmarkResult, game, gameName, user } from '$lib/server/db/schema';
import * as v from 'valibot';

export const PUBLIC_BENCHMARK_PAGE_SIZE = 30;

export interface PublicBenchmarkCursor {
	createdAt: number;
	id: string;
}

const positiveIntegerSearchParamSchema = v.pipe(
	v.string(),
	v.regex(/^[1-9]\d*$/),
	v.transform(Number),
	v.safeInteger(),
	v.minValue(1)
);

function parsePositiveIntegerSearchParam(
	searchParams: URLSearchParams,
	name: string
): number | undefined | false {
	const value = searchParams.get(name);
	if (value === null) return undefined;
	const result = v.safeParse(positiveIntegerSearchParamSchema, value);
	return result.success ? result.output : false;
}

export function parsePublicBenchmarkPage(
	searchParams: URLSearchParams
): number | undefined | false {
	return parsePositiveIntegerSearchParam(searchParams, 'page');
}

export function parsePublicBenchmarkGameId(
	searchParams: URLSearchParams
): number | undefined | false {
	return parsePositiveIntegerSearchParam(searchParams, 'game_id');
}

export function parsePublicBenchmarkCursor(
	searchParams: URLSearchParams
): PublicBenchmarkCursor | undefined | false {
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

interface PublicBenchmarkPageOptions {
	cursor?: PublicBenchmarkCursor;
	gameId?: number;
	page?: number;
	userId?: string;
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

export async function getPublicBenchmarksPage(options: PublicBenchmarkPageOptions = {}) {
	const { cursor, gameId, page = 1, userId } = options;
	const filterCondition = and(
		gameId === undefined ? undefined : eq(benchmarkResult.gameId, gameId),
		userId === undefined ? undefined : eq(benchmarkResult.userId, userId)
	);
	const totalCount =
		db.select({ totalCount: count() }).from(benchmarkResult).where(filterCondition).get()
			?.totalCount ?? 0;
	const totalPages = Math.max(1, Math.ceil(totalCount / PUBLIC_BENCHMARK_PAGE_SIZE));
	const resolvedPage = Math.min(page, totalPages);
	const cursorCondition = cursor
		? or(
				lt(benchmarkResult.createdAt, new Date(cursor.createdAt)),
				and(
					eq(benchmarkResult.createdAt, new Date(cursor.createdAt)),
					lt(benchmarkResult.id, cursor.id)
				)
			)
		: undefined;

	const query = db
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
		.where(and(cursorCondition, filterCondition))
		.orderBy(desc(benchmarkResult.createdAt), desc(benchmarkResult.id))
		.$dynamic();
	const rows = cursor
		? query.limit(PUBLIC_BENCHMARK_PAGE_SIZE + 1).all()
		: query
				.limit(PUBLIC_BENCHMARK_PAGE_SIZE)
				.offset((resolvedPage - 1) * PUBLIC_BENCHMARK_PAGE_SIZE)
				.all();

	const hasMore = cursor ? rows.length > PUBLIC_BENCHMARK_PAGE_SIZE : resolvedPage < totalPages;
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
				: null,
		pagination: cursor
			? null
			: {
					page: resolvedPage,
					pageSize: PUBLIC_BENCHMARK_PAGE_SIZE,
					totalCount,
					totalPages
				}
	};
}
