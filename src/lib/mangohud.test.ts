import { describe, expect, test } from 'bun:test';
import { parseMangoHudBenchmarkData, parseMangoHudSystemInfo } from './mangohud';

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
			ramKiB: 32771172,
			kernel: '6.16.7-2-cachyos',
			driver: '',
			cpuScheduler: 'performance'
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
			ramKiB: 16777216,
			kernel: '6.12.1',
			driver: 'mesa',
			cpuScheduler: 'sched-ext'
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
	test('parses time-series metrics and normalizes elapsed nanoseconds', () => {
		const csv = [
			'os,cpu,gpu,ram,kernel,driver,cpuscheduler',
			'Arch Linux,Example CPU,Example GPU,32771172,6.16.7,,performance',
			'fps,frametime,cpu_load,gpu_power,elapsed',
			'114.136,8.7615,23.2298,81,254636156',
			'122.986,8.13101,,82,279919926'
		].join('\n');

		expect(parseMangoHudBenchmarkData(csv)).toEqual({
			timeSeconds: [0, 0.02528377],
			metrics: [
				{ key: 'fps', values: [114.136, 122.986] },
				{ key: 'frametime', values: [8.7615, 8.13101] },
				{ key: 'cpu_load', values: [23.2298, null] },
				{ key: 'gpu_power', values: [81, 82] }
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
			timeSeconds: [0, 0.02],
			metrics: [
				{ key: 'fps', values: [60, 50] },
				{ key: 'frametime', values: [16.67, 20] }
			]
		});
	});

	test('does not parse unrelated CSV data as benchmark metrics', () => {
		expect(
			parseMangoHudBenchmarkData('Application,ProcessID,SwapChainAddress\nGame.exe,123,0x1')
		).toBe(null);
	});
});
