import type { BenchmarkRun } from '$lib/benchmark-run';

export interface BenchmarkChartRun {
	id: string;
	originalName: string;
	benchmarkRun: BenchmarkRun | null;
}

export interface BenchmarkMetricSeries {
	key: string;
	points: Array<{ timeSeconds: number; value: number }>;
}

const BENCHMARK_CHART_COLOR_COUNT = 8;
const ACRONYMS = new Set(['cpu', 'fps', 'gpu', 'mhz', 'ram', 'rss', 'vram']);

const METRIC_UNITS: Record<string, string> = {
	fps: 'FPS',
	frametime: 'ms',
	cpu_load: '%',
	cpu_power: 'W',
	gpu_load: '%',
	cpu_temp: '°C',
	gpu_temp: '°C',
	gpu_core_clock: 'MHz',
	gpu_mem_clock: 'MHz',
	gpu_vram_used: 'GiB',
	gpu_power: 'W',
	ram_used: 'GiB',
	process_rss: 'GiB'
};

export function formatBenchmarkMetricName(key: string): string {
	return key
		.split(/[_\s-]+/)
		.filter(Boolean)
		.map((word) => {
			const normalized = word.toLowerCase();
			return ACRONYMS.has(normalized)
				? normalized.toUpperCase()
				: normalized.charAt(0).toUpperCase() + normalized.slice(1);
		})
		.join(' ');
}

export function stripFileExtension(value: string): string {
	const lastSeparator = Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\'));
	const lastDot = value.lastIndexOf('.');
	return lastDot > lastSeparator + 1 && lastDot < value.length - 1
		? value.slice(0, lastDot)
		: value;
}

export function getBenchmarkMetricUnit(key: string): string {
	return METRIC_UNITS[key] ?? '';
}

export function averageMetricValues(values: Array<number | null>): number | null {
	let total = 0;
	let count = 0;

	for (const value of values) {
		if (value === null) continue;
		total += value;
		count++;
	}

	return count === 0 ? null : total / count;
}

export function calculateFrametimeStability(values: Array<number | null>): {
	standardDeviation: number;
	p99Overhead: number;
} | null {
	const average = averageMetricValues(values);
	const median = percentileMetricValue(values, 0.5);
	const p99 = percentileMetricValue(values, 0.99);

	if (
		average === null ||
		median === null ||
		p99 === null ||
		!Number.isFinite(average) ||
		!Number.isFinite(median) ||
		average <= 0 ||
		median <= 0
	) {
		return null;
	}

	let squaredDifferenceTotal = 0;
	let count = 0;
	for (const value of values) {
		if (value === null) continue;
		squaredDifferenceTotal += (value - average) ** 2;
		count++;
	}
	if (count === 0) return null;

	return {
		standardDeviation: (Math.sqrt(squaredDifferenceTotal / count) / average) * 100,
		p99Overhead: ((p99 - median) / median) * 100
	};
}

export function hasNonZeroMetricValues(values: Array<number | null>): boolean {
	return values.some((value) => value !== null && value !== 0);
}

export function percentagesRelativeToMinimum(values: readonly number[]): number[] {
	if (values.length === 0 || values.some((value) => !Number.isFinite(value) || value <= 0)) {
		return [];
	}

	const baseline = Math.min(...values);
	return values.map((value) => (value / baseline) * 100);
}

export function getBenchmarkChartColorIndex(benchmarkId: string, chartKey: string): number {
	const seed = `${benchmarkId}:${chartKey}`;
	let hash = 2_166_136_261;

	for (let index = 0; index < seed.length; index++) {
		hash ^= seed.charCodeAt(index);
		hash = Math.imul(hash, 16_777_619);
	}

	return (hash >>> 0) % BENCHMARK_CHART_COLOR_COUNT;
}

export function sortBenchmarkChartRunsByAverageFps(
	runs: readonly BenchmarkChartRun[]
): BenchmarkChartRun[] {
	return runs
		.map((run, index) => {
			const fps = run.benchmarkRun?.data.metrics.find(({ key }) => key === 'fps');
			const average =
				fps && hasNonZeroMetricValues(fps.values) ? averageMetricValues(fps.values) : null;
			return {
				run,
				index,
				average: average !== null && Number.isFinite(average) && average > 0 ? average : null
			};
		})
		.toSorted((first, second) => {
			if (first.average === null) {
				return second.average === null ? first.index - second.index : 1;
			}
			if (second.average === null) return -1;
			return first.average - second.average || first.index - second.index;
		})
		.map(({ run }) => run);
}

export function buildSharedMetricChartData(
	series: BenchmarkMetricSeries[]
): Array<{ timeSeconds: number } & Record<string, number | undefined>> {
	const sampleCount = Math.max(0, ...series.map(({ points }) => points.length));
	if (sampleCount === 0) return [];

	const maximumTime = Math.max(0, ...series.map(({ points }) => points.at(-1)?.timeSeconds ?? 0));

	return Array.from({ length: sampleCount }, (_, index) => {
		const timeSeconds = sampleCount === 1 ? 0 : (maximumTime * index) / (sampleCount - 1);
		const row: { timeSeconds: number } & Record<string, number | undefined> = { timeSeconds };

		for (const metricSeries of series) {
			row[metricSeries.key] = interpolateMetricValue(metricSeries.points, timeSeconds);
		}

		return row;
	});
}

export function percentileMetricValue(
	values: Array<number | null>,
	percentile: number
): number | null {
	const sorted = values
		.filter((value): value is number => value !== null)
		.toSorted((a, b) => a - b);
	if (sorted.length === 0) return null;
	if (sorted.length === 1) return sorted[0]!;

	const position = Math.min(1, Math.max(0, percentile)) * (sorted.length - 1);
	const lowerIndex = Math.floor(position);
	const upperIndex = Math.ceil(position);
	const lower = sorted[lowerIndex]!;
	const upper = sorted[upperIndex]!;

	return lower + (upper - lower) * (position - lowerIndex);
}

export function formatMetricValue(value: number, unit = ''): string {
	const maximumFractionDigits = Math.abs(value) >= 100 ? 1 : 2;
	const formatted = new Intl.NumberFormat('en', { maximumFractionDigits }).format(value);
	if (!unit) return formatted;
	return unit === '%' ? `${formatted}%` : `${formatted} ${unit}`;
}

function interpolateMetricValue(
	points: Array<{ timeSeconds: number; value: number }>,
	timeSeconds: number
): number | undefined {
	const first = points[0];
	const last = points.at(-1);
	if (!first || !last || timeSeconds < first.timeSeconds || timeSeconds > last.timeSeconds) {
		return undefined;
	}

	let lowerIndex = 0;
	let upperIndex = points.length - 1;

	while (lowerIndex <= upperIndex) {
		const middleIndex = Math.floor((lowerIndex + upperIndex) / 2);
		const middle = points[middleIndex]!;
		if (middle.timeSeconds === timeSeconds) return middle.value;
		if (middle.timeSeconds < timeSeconds) lowerIndex = middleIndex + 1;
		else upperIndex = middleIndex - 1;
	}

	const lower = points[Math.max(0, upperIndex)]!;
	const upper = points[Math.min(points.length - 1, lowerIndex)]!;
	if (lower.timeSeconds === upper.timeSeconds) return upper.value;

	const progress = (timeSeconds - lower.timeSeconds) / (upper.timeSeconds - lower.timeSeconds);
	return lower.value + (upper.value - lower.value) * progress;
}
