import { describe, expect, test } from 'bun:test';
import { createBenchmarkMetric, type BenchmarkRun } from '$lib/benchmark-run';
import {
	BENCHMARK_PARSER_VERSION,
	deserializeParsedBenchmarkRun,
	getParsedBenchmarkRunVersion,
	serializeParsedBenchmarkRun
} from '$lib/benchmark-run-cache';

const benchmarkRun: BenchmarkRun = {
	source: 'mangohud',
	systemInfo: {
		os: 'Linux',
		cpu: 'Example CPU',
		gpu: 'Example GPU',
		ramBytes: null,
		ramDescription: '',
		kernel: '',
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
};

describe('parsed benchmark run cache', () => {
	test('round-trips a run with the current parser version', () => {
		const serialized = serializeParsedBenchmarkRun(benchmarkRun);
		const serializedObject = JSON.parse(serialized);

		expect(getParsedBenchmarkRunVersion(serialized)).toBe(BENCHMARK_PARSER_VERSION);
		expect(deserializeParsedBenchmarkRun(serialized)).toEqual(benchmarkRun);
		expect(serializedObject.timeAxes).toEqual([[0]]);
		expect(serializedObject.metrics).toEqual([
			{ key: 'fps', timeAxis: 0, values: [60] },
			{ key: 'frametime', timeAxis: 0, values: [16.67] }
		]);
	});

	test('rejects mismatched versions, malformed JSON, and invalid cache structures', () => {
		const mismatchedVersion = serializeParsedBenchmarkRun(benchmarkRun).replace(
			`"version":${BENCHMARK_PARSER_VERSION}`,
			`"version":${BENCHMARK_PARSER_VERSION + 1}`
		);
		const invalidTimeAxis = serializeParsedBenchmarkRun(benchmarkRun).replace(
			'"timeAxis":0',
			'"timeAxis":99'
		);

		expect(deserializeParsedBenchmarkRun(mismatchedVersion)).toBe(null);
		expect(deserializeParsedBenchmarkRun(invalidTimeAxis)).toBe(null);
		expect(deserializeParsedBenchmarkRun('not json')).toBe(null);
		expect(deserializeParsedBenchmarkRun('{"version":1}')).toBe(null);
		expect(getParsedBenchmarkRunVersion('{"benchmarkRun":{}}')).toBe(null);
	});
});
