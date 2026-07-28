import { describe, expect, test } from 'bun:test';
import { createBenchmarkMetric } from './benchmark-run-model';
import {
	parseMangoHudBenchmarkData,
	parseMangoHudBenchmarkRun,
	parseMangoHudSystemInfo
} from './mangohud';

describe('MangoHud system information parsing', () => {
	test('parses the system header and values from a MangoHud CSV', () => {
		const csv = [
			'os,cpu,gpu,ram,kernel,driver,cpuscheduler',
			'Arch Linux,AMD Ryzen 9 5950X 16-Core Processor,AMD Radeon RX 9070 XT (RADV GFX1201),32771172,6.16.7-2-cachyos,,performance',
			'fps,frametime'
		].join('\n');

		expect(parseMangoHudSystemInfo(csv)).toEqual({
			os: 'Arch Linux',
			cpu: 'AMD Ryzen 9 5950X 16-Core Processor',
			gpu: 'AMD Radeon RX 9070 XT (RADV GFX1201)',
			ramBytes: 32771172 * 1_024,
			ramDescription: '',
			kernel: '6.16.7-2-cachyos',
			driver: '',
			cpuScheduler: 'performance',
			motherboard: ''
		});
	});

	test('handles a byte-order mark, CRLF records, and quoted commas', () => {
		const csv =
			'\uFEFFos,cpu,gpu,ram,kernel,driver,cpuscheduler\r\n' +
			'Fedora,"Example CPU, 16-Core","Example ""Fast"" GPU",16777216,6.12.1,mesa,sched-ext\r\n';

		expect(parseMangoHudSystemInfo(csv)).toEqual({
			os: 'Fedora',
			cpu: 'Example CPU, 16-Core',
			gpu: 'Example "Fast" GPU',
			ramBytes: 16777216 * 1_024,
			ramDescription: '',
			kernel: '6.12.1',
			driver: 'mesa',
			cpuScheduler: 'sched-ext',
			motherboard: ''
		});
	});

	test('does not identify unrelated CSV data as MangoHud output', () => {
		expect(
			parseMangoHudSystemInfo('Application,ProcessID,SwapChainAddress\nGame.exe,123,0x1')
		).toBe(null);
		expect(parseMangoHudSystemInfo('os,cpu,gpu,ram,kernel')).toBe(null);
	});
});

describe('MangoHud benchmark data parsing', () => {
	test('parses system information and metrics together in one pass', () => {
		const csv = [
			'os,cpu,gpu,ram,kernel',
			'Linux,Example CPU,Example GPU,16777216,6.12',
			'fps,frametime',
			'60,16.67'
		].join('\n');

		expect(parseMangoHudBenchmarkRun(csv)).toEqual({
			source: 'mangohud',
			systemInfo: {
				os: 'Linux',
				cpu: 'Example CPU',
				gpu: 'Example GPU',
				ramBytes: 16777216 * 1_024,
				ramDescription: '',
				kernel: '6.12',
				driver: '',
				cpuScheduler: '',
				motherboard: ''
			},
			data: {
				metrics: [
					createBenchmarkMetric('fps', [0], [60]),
					createBenchmarkMetric('frametime', [0], [16.67])
				]
			}
		});
	});

	test('parses time-series metrics and normalizes elapsed nanoseconds', () => {
		const csv = [
			'os,cpu,gpu,ram,kernel,driver,cpuscheduler',
			'Arch Linux,Example CPU,Example GPU,32771172,6.16.7,,performance',
			'fps,frametime,cpu_load,gpu_power,elapsed',
			'114.136,8.7615,23.2298,81,254636156',
			'122.986,8.13101,,82,279919926'
		].join('\n');

		expect(parseMangoHudBenchmarkData(csv)).toEqual({
			metrics: [
				createBenchmarkMetric('fps', [0, 0.02528377], [114.136, 122.986]),
				createBenchmarkMetric('frametime', [0, 0.02528377], [8.7615, 8.13101]),
				createBenchmarkMetric('cpu_load', [0, 0.02528377], [23.2298, null]),
				createBenchmarkMetric('gpu_power', [0, 0.02528377], [81, 82])
			]
		});
	});

	test('falls back to frametime when elapsed is missing and omits empty metrics', () => {
		const csv = [
			'os,cpu,gpu,ram,kernel',
			'Linux,Example CPU,Example GPU,16777216,6.12',
			'fps,frametime,gpu_load',
			'60,16.67,',
			'50,20,'
		].join('\n');

		expect(parseMangoHudBenchmarkData(csv)).toEqual({
			metrics: [
				createBenchmarkMetric('fps', [0, 0.02], [60, 50]),
				createBenchmarkMetric('frametime', [0, 0.02], [16.67, 20])
			]
		});
	});

	test('only exposes metrics shared with CapFrameX', () => {
		const csv = [
			'os,cpu,gpu,ram,kernel',
			'Linux,Example CPU,Example GPU,16777216,6.12',
			'fps,frametime,cpu_load,cpu_mhz,swap_used,unknown_metric',
			'60,16.67,20,5000,1.5,123'
		].join('\n');

		expect(parseMangoHudBenchmarkData(csv)?.metrics.map(({ key }) => key)).toEqual([
			'fps',
			'frametime',
			'cpu_load',
			'cpu_mhz'
		]);
	});

	test('does not parse unrelated CSV data as benchmark metrics', () => {
		expect(
			parseMangoHudBenchmarkData('Application,ProcessID,SwapChainAddress\nGame.exe,123,0x1')
		).toBe(null);
	});
});
