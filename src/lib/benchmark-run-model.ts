import * as v from 'valibot';

export const BENCHMARK_METRIC_KEYS = [
	'fps',
	'frametime',
	'cpu_load',
	'cpu_mhz',
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

export type BenchmarkMetricKey = (typeof BENCHMARK_METRIC_KEYS)[number];
export const benchmarkMetricKeySchema = v.picklist(BENCHMARK_METRIC_KEYS);

export const BENCHMARK_METRIC_DEFINITIONS = {
	fps: { prettyName: 'FPS', unit: 'FPS' },
	frametime: { prettyName: 'Frametime', unit: 'ms' },
	cpu_load: { prettyName: 'CPU Load', unit: '%' },
	cpu_mhz: { prettyName: 'CPU MHz', unit: 'MHz' },
	cpu_power: { prettyName: 'CPU Power', unit: 'W' },
	gpu_load: { prettyName: 'GPU Load', unit: '%' },
	cpu_temp: { prettyName: 'CPU Temp', unit: '°C' },
	gpu_temp: { prettyName: 'GPU Temp', unit: '°C' },
	gpu_core_clock: { prettyName: 'GPU Core Clock', unit: 'MHz' },
	gpu_mem_clock: { prettyName: 'GPU Memory Clock', unit: 'MHz' },
	gpu_vram_used: { prettyName: 'GPU VRAM Used', unit: 'GiB' },
	gpu_power: { prettyName: 'GPU Power', unit: 'W' },
	ram_used: { prettyName: 'RAM Used', unit: 'GiB' },
	process_rss: { prettyName: 'Process RAM Usage', unit: 'GiB' }
} as const satisfies Record<BenchmarkMetricKey, { prettyName: string; unit: string }>;

export type BenchmarkSource = 'mangohud' | 'capframex';

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
	prettyName: string;
	unit: string;
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

export function createBenchmarkMetric(
	key: BenchmarkMetricKey,
	timeSeconds: number[],
	values: Array<number | null>
): BenchmarkMetric {
	return {
		key,
		...BENCHMARK_METRIC_DEFINITIONS[key],
		timeSeconds,
		values
	};
}
