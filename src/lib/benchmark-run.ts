import { parseMangoHudBenchmarkRun, parseMangoHudSystemInfo } from '#lib/mangohud.js';
import { parseCapFrameXBenchmarkRun, parseCapFrameXSystemInfo } from '#lib/capframex.js';
import type { BenchmarkRun, BenchmarkSystemInfo } from '#lib/benchmark-run-model.js';

export {
	BENCHMARK_METRIC_KEYS,
	BENCHMARK_METRIC_DEFINITIONS,
	benchmarkMetricKeySchema,
	createBenchmarkMetric,
	type BenchmarkData,
	type BenchmarkMetric,
	type BenchmarkMetricKey,
	type BenchmarkRun,
	type BenchmarkSource,
	type BenchmarkSystemInfo
} from '#lib/benchmark-run-model.js';

export function parseBenchmarkContents(contents: string): BenchmarkRun | null {
	if (looksLikeJson(contents)) return parseCapFrameXBenchmarkRun(contents);
	return parseMangoHudBenchmarkRun(contents);
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
