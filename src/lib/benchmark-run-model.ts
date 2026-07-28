export const BENCHMARK_METRIC_KEYS = [
	'fps',
	'frametime',
	'cpu_load',
	'cpu_power',
	'gpu_load',
	'cpu_temp',
	'gpu_temp',
	'gpu_core_clock',
	'gpu_mem_clock',
	'gpu_vram_used',
	'gpu_power',
	'ram_used',
	'process_rss'
] as const;

export type BenchmarkSource = 'mangohud' | 'capframex';
export type BenchmarkMetricKey = (typeof BENCHMARK_METRIC_KEYS)[number];

export interface BenchmarkSystemInfo {
	os: string;
	cpu: string;
	gpu: string;
	ramBytes: number | null;
	ramDescription: string;
	kernel: string;
	driver: string;
	cpuScheduler: string;
	motherboard: string;
}

export interface BenchmarkMetric {
	key: BenchmarkMetricKey;
	timeSeconds: number[];
	values: Array<number | null>;
}

export interface BenchmarkData {
	metrics: BenchmarkMetric[];
}

export interface BenchmarkRun {
	source: BenchmarkSource;
	systemInfo: BenchmarkSystemInfo;
	data: BenchmarkData;
}

export function isBenchmarkMetricKey(value: string): value is BenchmarkMetricKey {
	return (BENCHMARK_METRIC_KEYS as readonly string[]).includes(value);
}
