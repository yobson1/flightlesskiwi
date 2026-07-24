import type { MangoHudBenchmarkData } from '$lib/mangohud';

export interface BenchmarkChartRun {
	id: string;
	originalName: string;
	mangoHudData: MangoHudBenchmarkData | null;
}

export interface BenchmarkMetricSeries {
	key: string;
	points: Array<{ timeSeconds: number; value: number }>;
}

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
	swap_used: 'GiB',
	process_rss: 'GiB',
	cpu_mhz: 'MHz'
};

export const BENCHMARK_CHART_COLORS = [
	'var(--chart-1)',
	'var(--chart-2)',
	'var(--chart-3)',
	'var(--chart-4)',
	'var(--chart-5)',
	'color-mix(in oklch, var(--chart-1), var(--chart-4) 45%)',
	'color-mix(in oklch, var(--chart-2), var(--chart-5) 45%)',
	'color-mix(in oklch, var(--chart-3), var(--chart-4) 45%)'
] as const;

const BOTTOM_LAYOUT = {
	withoutLegend: {
		padding: 44,
		xAxisLabelProps: undefined
	},
	withLegend: {
		padding: 76,
		xAxisLabelProps: { dy: -24 }
	}
} as const;

export function getBenchmarkChartBottomLayout(hasLegend: boolean) {
	return hasLegend ? BOTTOM_LAYOUT.withLegend : BOTTOM_LAYOUT.withoutLegend;
}

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

export function hasNonZeroMetricValues(values: Array<number | null>): boolean {
	return values.some((value) => value !== null && value !== 0);
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
	return unit ? `${formatted} ${unit}` : formatted;
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
