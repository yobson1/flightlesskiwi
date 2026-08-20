import { parseBenchmarkContents, type BenchmarkRun } from '#lib/benchmark-run.js';
import { debug, warn } from '#lib/logger.js';
import {
	readBenchmarkFile,
	readParsedBenchmarkFile,
	writeParsedBenchmarkFile,
	type ParsedBenchmarkFileResult
} from '#lib/server/benchmark-files.js';

interface ParseBenchmarkRunOptions {
	fileId: string;
	contents?: string;
	label?: string;
}

export async function parseBenchmarkRun({
	fileId,
	contents: providedContents,
	label = fileId
}: ParseBenchmarkRunOptions): Promise<BenchmarkRun | null> {
	const cacheReadStartedAt = performance.now();
	let cache: ParsedBenchmarkFileResult;
	let cacheReadCause: unknown;
	try {
		cache = await readParsedBenchmarkFile(fileId);
	} catch (cause) {
		cacheReadCause = cause;
		cache = {
			status: 'invalid',
			benchmarkRun: null
		};
	}
	const cacheReadDuration = performance.now() - cacheReadStartedAt;
	if (cache.status === 'hit') {
		debug(`Benchmark file: ${label} (${fileId}) cache=hit read=${cacheReadDuration.toFixed(2)} ms`);
		return cache.benchmarkRun;
	}

	let contents = providedContents;
	let rawReadDuration: number | null = null;
	if (contents === undefined) {
		const rawReadStartedAt = performance.now();
		contents = await readBenchmarkFile(fileId);
		rawReadDuration = performance.now() - rawReadStartedAt;
	}

	const parseStartedAt = performance.now();
	const benchmarkRun = parseBenchmarkContents(contents);
	const parseDuration = performance.now() - parseStartedAt;
	let cacheWriteDuration = 0;
	let cacheWriteCause: unknown;
	if (benchmarkRun && cache.status !== 'newer') {
		const cacheWriteStartedAt = performance.now();
		try {
			await writeParsedBenchmarkFile(fileId, benchmarkRun);
		} catch (cause) {
			cacheWriteCause = cause;
		}
		cacheWriteDuration = performance.now() - cacheWriteStartedAt;
	}

	const rawRead = rawReadDuration === null ? 'preloaded' : `${rawReadDuration.toFixed(2)} ms`;
	const message = `Benchmark file: ${label} (${fileId}) cache=${cache.status} cacheRead=${cacheReadDuration.toFixed(2)} ms rawRead=${rawRead} parse=${parseDuration.toFixed(2)} ms cacheWrite=${cacheWriteDuration.toFixed(2)} ms`;
	const cacheCause = cacheReadCause ?? cacheWriteCause;
	if (cacheCause) warn(message, cacheCause);
	else debug(message);
	return benchmarkRun;
}
