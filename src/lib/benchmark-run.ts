import { parseMangoHudBenchmarkData, parseMangoHudSystemInfo } from '$lib/mangohud';
import { parseCapFrameXBenchmarkRun, parseCapFrameXSystemInfo } from '$lib/capframex';
import type { BenchmarkRun, BenchmarkSystemInfo } from '$lib/benchmark-run-model';

export {
	BENCHMARK_METRIC_KEYS,
	BENCHMARK_METRIC_DEFINITIONS,
	createBenchmarkMetric,
	isBenchmarkMetricKey,
	type BenchmarkData,
	type BenchmarkMetric,
	type BenchmarkMetricKey,
	type BenchmarkRun,
	type BenchmarkSource,
	type BenchmarkSystemInfo
} from '$lib/benchmark-run-model';

export function parseBenchmarkRun(contents: string): BenchmarkRun | null {
	if (looksLikeJson(contents)) return parseCapFrameXBenchmarkRun(contents);

	const mangoHudSystemInfo = parseMangoHudSystemInfo(contents);
	if (mangoHudSystemInfo) {
		const data = parseMangoHudBenchmarkData(contents);
		return data ? { source: 'mangohud', systemInfo: mangoHudSystemInfo, data } : null;
	}

	return null;
}

export function parseBenchmarkSystemInfo(contents: string): BenchmarkSystemInfo | null {
	if (looksLikeJson(contents)) return parseCapFrameXSystemInfo(contents);
	return parseMangoHudSystemInfo(contents) ?? parseCapFrameXSystemInfo(contents);
}

function looksLikeJson(contents: string): boolean {
	return contents
		.replace(/^\uFEFF/, '')
		.trimStart()
		.startsWith('{');
}
