import {
	BENCHMARK_METRIC_KEYS,
	createBenchmarkMetric,
	type BenchmarkMetricKey,
	type BenchmarkRun,
	type BenchmarkSource,
	type BenchmarkSystemInfo
} from '$lib/benchmark-run-model';
import * as v from 'valibot';

// Increment this whenever parser changes alter the normalized BenchmarkRun output.
export const BENCHMARK_PARSER_VERSION = 1;

interface ParsedBenchmarkRun {
	version: typeof BENCHMARK_PARSER_VERSION;
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

const benchmarkSystemInfoSchema = v.object({
	os: v.string(),
	cpu: v.string(),
	gpu: v.string(),
	ramBytes: v.nullable(v.number()),
	ramDescription: v.string(),
	kernel: v.string(),
	driver: v.string(),
	cpuScheduler: v.string(),
	motherboard: v.string()
});
const parsedBenchmarkRunSchema = v.pipe(
	v.object({
		version: v.literal(BENCHMARK_PARSER_VERSION),
		source: v.picklist(['mangohud', 'capframex']),
		systemInfo: benchmarkSystemInfoSchema,
		timeAxes: v.array(v.array(v.number())),
		metrics: v.array(
			v.object({
				key: v.picklist(BENCHMARK_METRIC_KEYS),
				timeAxis: v.pipe(v.number(), v.safeInteger(), v.minValue(0)),
				values: v.array(v.union([v.number(), v.null()]))
			})
		)
	}),
	v.check((run) =>
		run.metrics.every(
			(metric) =>
				metric.timeAxis < run.timeAxes.length &&
				run.timeAxes[metric.timeAxis]!.length === metric.values.length
		)
	)
);

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
		const result = v.safeParse(parsedBenchmarkRunSchema, JSON.parse(contents));
		if (!result.success) return null;
		const parsed = result.output;

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
