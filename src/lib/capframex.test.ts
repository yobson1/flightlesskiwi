import { describe, expect, test } from 'bun:test';
import { createBenchmarkMetric } from './benchmark-run-model';
import {
	getCapFrameXRunCount,
	parseCapFrameXBenchmarkData,
	parseCapFrameXBenchmarkRun,
	parseCapFrameXSystemInfo
} from './capframex';

function capFrameXJson(overrides: Record<string, unknown> = {}) {
	return JSON.stringify({
		Info: {
			AppVersion: '1.8.6.2',
			Processor: 'AMD Ryzen 9 5950X',
			GPU: 'AMD Radeon RX 9070 XT',
			OS: 'Microsoft Windows 11 Pro Build 26200',
			SystemRam: '32GB (4x8GB) 3200MT/s',
			GPUDriverVersion: 'Adrenalin 26.6.1',
			Motherboard: 'Example X570'
		},
		Runs: [
			{
				CaptureData: {
					TimeInSeconds: [10, 10.1, 10.25, 10.5],
					MsBetweenPresents: [10, 20, 5, 8],
					MsUntilDisplayed: [12, 22, 7, 10]
				},
				SensorData2: {
					MeasureTime: { Name: 'MeasureTime', Type: 'Time', Values: [-0.1, 0, 0.25, 0.5] },
					cpuTotal: { Name: 'CPU Total', Type: 'Load', Values: [1, 20, 30, 40] },
					cpuPower: { Name: 'CPU Package', Type: 'Power', Values: [1, 100, 110, 120] },
					cpuTemp: {
						Name: 'CPU Package (Tctl/Tdie)',
						Type: 'Temperature',
						Values: [1, 60, 61, 62]
					},
					cpuMax: { Name: 'CPU Max', Type: 'Load', Values: [99, 99, 99, 99] },
					cpuMaxClock: { Name: 'CPU Max', Type: 'Clock', Values: [5000, 5000, 5000, 5000] },
					gpuCore: { Name: 'GPU Core', Type: 'Load', Values: [1, 80, 90, 95] },
					gpuTemp: { Name: 'GPU Core', Type: 'Temperature', Values: [1, 50, 51, 52] },
					gpuClock: { Name: 'GPU Core', Type: 'Clock', Values: [1, 2000, 2100, 2200] },
					gpuMemoryClock: {
						Name: 'GPU Memory',
						Type: 'Clock',
						Values: [1, 2500, 2500, 2500]
					},
					gpuPower: { Name: 'GPU Power', Type: 'Power', Values: [1, 100, 110, 120] },
					gpuTbp: { Name: 'GPU TBP', Type: 'Power', Values: [1, 200, 210, 220] },
					gpuMemory: {
						Name: 'GPU Memory Dedicated',
						Type: 'Data',
						Values: [1, 8, 8.5, 9]
					},
					gameRam: { Name: 'RAM Game Used', Type: 'Data', Values: [1, 2, 2.5, 3] },
					systemRam: { Name: 'RAM Used', Type: 'Data', Values: [1, 10, 11, 12] },
					unrelated: { Name: 'GPU Fan', Type: 'Fan', Values: [1, 2, 3, 4] }
				}
			}
		],
		...overrides
	});
}

describe('CapFrameX system information parsing', () => {
	test('normalizes CapFrameX system information', () => {
		expect(parseCapFrameXSystemInfo(capFrameXJson())).toEqual({
			os: 'Microsoft Windows 11 Pro Build 26200',
			cpu: 'AMD Ryzen 9 5950X',
			gpu: 'AMD Radeon RX 9070 XT',
			ramBytes: 32 * 1024 ** 3,
			ramDescription: '32GB (4x8GB) 3200MT/s',
			kernel: '',
			driver: 'Adrenalin 26.6.1',
			cpuScheduler: '',
			motherboard: 'Example X570'
		});
	});

	test('can read the Info object from a truncated file prefix', () => {
		const prefix =
			'{"Info":{"AppVersion":"1.8.6.2","Processor":"CPU","GPU":"GPU","SystemRam":"16GB"},"Runs":[';

		expect(parseCapFrameXSystemInfo(prefix)).toMatchObject({
			cpu: 'CPU',
			gpu: 'GPU',
			ramBytes: 16 * 1024 ** 3
		});
	});
});

describe('CapFrameX benchmark data parsing', () => {
	test('maps only shared frame and sensor metrics onto independent time axes', () => {
		const data = parseCapFrameXBenchmarkData(capFrameXJson());

		expect(data?.metrics.map(({ key }) => key)).toEqual([
			'fps',
			'frametime',
			'cpu_load',
			'cpu_power',
			'cpu_temp',
			'cpu_mhz',
			'gpu_load',
			'gpu_temp',
			'gpu_core_clock',
			'gpu_mem_clock',
			'gpu_power',
			'gpu_vram_used',
			'process_rss',
			'ram_used'
		]);
		expect(data?.metrics.find(({ key }) => key === 'fps')).toEqual(
			createBenchmarkMetric('fps', [0, 0.09999999999999964, 0.25, 0.5], [100, 50, 200, 125])
		);
		expect(data?.metrics.find(({ key }) => key === 'cpu_load')).toEqual(
			createBenchmarkMetric('cpu_load', [0, 0.25, 0.5], [20, 30, 40])
		);
		expect(data?.metrics.find(({ key }) => key === 'cpu_mhz')?.values).toEqual([5000, 5000, 5000]);
		expect(data?.metrics.find(({ key }) => key === 'gpu_power')?.values).toEqual([200, 210, 220]);
		expect(parseCapFrameXBenchmarkRun(capFrameXJson())?.source).toBe('capframex');
	});

	test('supports the legacy sensor object without exposing CPU Max load', () => {
		const json = capFrameXJson({
			Runs: [
				{
					CaptureData: {
						TimeInSeconds: [0, 0.25],
						MsBetweenPresents: [10, 12]
					},
					SensorData: {
						MeasureTime: [0, 0.25],
						CpuUsage: [20, 30],
						CpuMaxClock: [4800, 4900],
						CpuMaxThreadUsage: [90, 95],
						RamUsage: [2, 3],
						VRamUsage: [2048, 3072]
					}
				}
			]
		});

		expect(parseCapFrameXBenchmarkData(json)?.metrics).toEqual(
			expect.arrayContaining([
				createBenchmarkMetric('cpu_load', [0, 0.25], [20, 30]),
				createBenchmarkMetric('cpu_mhz', [0, 0.25], [4800, 4900]),
				createBenchmarkMetric('process_rss', [0, 0.25], [2, 3]),
				createBenchmarkMetric('gpu_vram_used', [0, 0.25], [2, 3])
			])
		);
	});

	test('requires exactly one run per CapFrameX file', () => {
		const empty = capFrameXJson({ Runs: [] });
		const multiple = capFrameXJson({ Runs: [{}, {}] });

		expect(getCapFrameXRunCount(empty)).toBe(0);
		expect(getCapFrameXRunCount(multiple)).toBe(2);
		expect(parseCapFrameXBenchmarkData(empty)).toBe(null);
		expect(parseCapFrameXBenchmarkData(multiple)).toBe(null);
	});
});
