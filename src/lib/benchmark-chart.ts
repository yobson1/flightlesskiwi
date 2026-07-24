import type { MangoHudBenchmarkData } from '$lib/mangohud';

export interface BenchmarkChartRun {
	id: string;
	originalName: string;
	mangoHudData: MangoHudBenchmarkData | null;
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
