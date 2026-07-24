import { describe, expect, test } from 'bun:test';
import { parseMangoHudSystemInfo } from './mangohud';

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
