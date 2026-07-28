import {
	createBenchmarkMetric,
	isBenchmarkMetricKey,
	type BenchmarkMetricKey,
	type BenchmarkRun,
	type BenchmarkSource,
	type BenchmarkSystemInfo
} from '$lib/benchmark-run-model';

// Increment this whenever parser changes alter the normalized BenchmarkRun output.
export const BENCHMARK_PARSER_VERSION = 1;

interface ParsedBenchmarkRun {
	version: number;
	source: BenchmarkSource;
	systemInfo: BenchmarkSystemInfo;
	timeAxes: number[][];
	metrics: ParsedBenchmarkMetric[];
}

interface ParsedBenchmarkMetric {
	key: BenchmarkMetricKey;
	timeAxis: number;
	values: Array<number | null>;
}

export function getParsedBenchmarkRunVersion(contents: string): number | null {
	const match = /^\s*\{"version":(\d+),/.exec(contents);
	if (!match) return null;

	const version = Number(match[1]);
	return Number.isSafeInteger(version) && version > 0 ? version : null;
}

export function serializeParsedBenchmarkRun(benchmarkRun: BenchmarkRun): string {
	const timeAxes: number[][] = [];
	const metrics = benchmarkRun.data.metrics.map((metric) => ({
		key: metric.key,
		timeAxis: findOrAddTimeAxis(timeAxes, metric.timeSeconds),
		values: metric.values
	}));

	return JSON.stringify({
		version: BENCHMARK_PARSER_VERSION,
		source: benchmarkRun.source,
		systemInfo: benchmarkRun.systemInfo,
		timeAxes,
		metrics
	} satisfies ParsedBenchmarkRun);
}

export function deserializeParsedBenchmarkRun(contents: string): BenchmarkRun | null {
	try {
		const parsed = JSON.parse(contents) as Partial<ParsedBenchmarkRun>;
		if (!isParsedBenchmarkRun(parsed)) return null;

		return {
			source: parsed.source,
			systemInfo: parsed.systemInfo,
			data: {
				metrics: parsed.metrics.map((metric) =>
					createBenchmarkMetric(metric.key, parsed.timeAxes[metric.timeAxis]!, metric.values)
				)
			}
		};
	} catch {
		return null;
	}
}

function findOrAddTimeAxis(timeAxes: number[][], timeSeconds: number[]): number {
	const existingIndex = timeAxes.findIndex(
		(timeAxis) => timeAxis === timeSeconds || arraysEqual(timeAxis, timeSeconds)
	);
	if (existingIndex !== -1) return existingIndex;

	timeAxes.push(timeSeconds);
	return timeAxes.length - 1;
}

function arraysEqual(left: number[], right: number[]): boolean {
	if (left.length !== right.length) return false;
	for (let index = 0; index < left.length; index++) {
		if (left[index] !== right[index]) return false;
	}
	return true;
}

function isParsedBenchmarkRun(value: unknown): value is ParsedBenchmarkRun {
	if (typeof value !== 'object' || value === null) return false;

	const run = value as Partial<ParsedBenchmarkRun>;
	return (
		run.version === BENCHMARK_PARSER_VERSION &&
		(run.source === 'mangohud' || run.source === 'capframex') &&
		isBenchmarkSystemInfo(run.systemInfo) &&
		Array.isArray(run.timeAxes) &&
		run.timeAxes.every(Array.isArray) &&
		Array.isArray(run.metrics) &&
		run.metrics.every(
			(metric) =>
				typeof metric === 'object' &&
				metric !== null &&
				isBenchmarkMetricKey(metric.key) &&
				Number.isSafeInteger(metric.timeAxis) &&
				metric.timeAxis >= 0 &&
				metric.timeAxis < run.timeAxes!.length &&
				Array.isArray(metric.values) &&
				run.timeAxes![metric.timeAxis]!.length === metric.values.length
		)
	);
}

function isBenchmarkSystemInfo(value: unknown): boolean {
	if (typeof value !== 'object' || value === null) return false;

	const systemInfo = value as Record<string, unknown>;
	return (
		typeof systemInfo.os === 'string' &&
		typeof systemInfo.cpu === 'string' &&
		typeof systemInfo.gpu === 'string' &&
		(systemInfo.ramBytes === null || typeof systemInfo.ramBytes === 'number') &&
		typeof systemInfo.ramDescription === 'string' &&
		typeof systemInfo.kernel === 'string' &&
		typeof systemInfo.driver === 'string' &&
		typeof systemInfo.cpuScheduler === 'string' &&
		typeof systemInfo.motherboard === 'string'
	);
}
