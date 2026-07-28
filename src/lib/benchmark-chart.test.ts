import { describe, expect, test } from 'bun:test';
import {
	averageMetricValues,
	buildSharedMetricChartData,
	calculateFrametimeStability,
	formatMetricValue,
	getBenchmarkChartColorIndex,
	hasNonZeroMetricValues,
	percentagesRelativeToMinimum,
	percentileMetricValue,
	sortBenchmarkChartRunsByAverageFps,
	stripFileExtension
} from './benchmark-chart';
import { createBenchmarkMetric, type BenchmarkRun } from './benchmark-run';

function parsedBenchmarkRun(fps: number[]): BenchmarkRun {
	return {
		source: 'mangohud',
		systemInfo: {
			os: '',
			cpu: '',
			gpu: '',
			ramBytes: null,
			ramDescription: '',
			kernel: '',
			driver: '',
			cpuScheduler: '',
			motherboard: ''
		},
		data: {
			metrics: [
				createBenchmarkMetric(
					'fps',
					fps.map((_, index) => index),
					fps
				)
			]
		}
	};
}

describe('benchmark chart metric helpers', () => {
	test('formats metric values with and without units', () => {
		expect(formatMetricValue(110, '%')).toBe('110%');
		expect(formatMetricValue(110)).toBe('110');
	});

	test('strips the final extension from benchmark filenames', () => {
		expect(stripFileExtension('benchmark.csv')).toBe('benchmark');
		expect(stripFileExtension('benchmark.high.csv')).toBe('benchmark.high');
		expect(stripFileExtension('.hidden')).toBe('.hidden');
		expect(stripFileExtension('benchmark')).toBe('benchmark');
	});

	test('calculates averages and interpolated percentiles while ignoring missing samples', () => {
		expect(averageMetricValues([10, null, 20])).toBe(15);
		expect(percentileMetricValue([0, null, 100], 0.25)).toBe(25);
		expect(averageMetricValues([null])).toBe(null);
		expect(percentileMetricValue([], 0.5)).toBe(null);
	});

	test('calculates normalized frametime stability while ignoring missing samples', () => {
		const stability = calculateFrametimeStability([10, null, 20, 30]);

		expect(stability?.standardDeviation).toBeCloseTo(40.8248);
		expect(stability?.p99Overhead).toBeCloseTo(49);
		expect(calculateFrametimeStability([10, 10, 10])).toEqual({
			standardDeviation: 0,
			p99Overhead: 0
		});
		expect(calculateFrametimeStability([])).toBe(null);
	});

	test('distinguishes captured metrics from all-zero placeholder data', () => {
		expect(hasNonZeroMetricValues([null, 0, 0])).toBe(false);
		expect(hasNonZeroMetricValues([null, 0, 0.01])).toBe(true);
		expect(hasNonZeroMetricValues([-1, 0])).toBe(true);
	});

	test('expresses values relative to the lowest 100% baseline', () => {
		const percentages = percentagesRelativeToMinimum([60, 66]);

		expect(percentages[0]).toBe(100);
		expect(percentages[1]).toBeCloseTo(110);
		expect(percentagesRelativeToMinimum([])).toEqual([]);
		expect(percentagesRelativeToMinimum([0, 60])).toEqual([]);
	});

	test('derives stable chart palette indexes from the benchmark and chart keys', () => {
		const colorIndex = getBenchmarkChartColorIndex('benchmark-123', 'summary:fps');

		expect(getBenchmarkChartColorIndex('benchmark-123', 'summary:fps')).toBe(colorIndex);
		expect(colorIndex).toBeGreaterThanOrEqual(0);
		expect(colorIndex).toBeLessThan(8);
		expect(getBenchmarkChartColorIndex('benchmark-123', 'summary:frametime')).not.toBe(colorIndex);
	});

	test('orders chart runs by ascending average FPS and leaves missing FPS last', () => {
		const runs = [
			{
				id: 'slow',
				originalName: 'Slow',
				benchmarkRun: parsedBenchmarkRun([59, 61])
			},
			{
				id: 'missing',
				originalName: 'Missing',
				benchmarkRun: null
			},
			{
				id: 'fast',
				originalName: 'Fast',
				benchmarkRun: parsedBenchmarkRun([65, 67])
			}
		];

		expect(sortBenchmarkChartRunsByAverageFps(runs).map(({ id }) => id)).toEqual([
			'slow',
			'fast',
			'missing'
		]);
		expect(runs.map(({ id }) => id)).toEqual(['slow', 'missing', 'fast']);
	});

	test('aligns independently sampled runs onto one shared time grid', () => {
		expect(
			buildSharedMetricChartData([
				{
					key: 'first',
					points: [
						{ timeSeconds: 0, value: 10 },
						{ timeSeconds: 2, value: 30 },
						{ timeSeconds: 4, value: 50 }
					]
				},
				{
					key: 'second',
					points: [
						{ timeSeconds: 0, value: 20 },
						{ timeSeconds: 4, value: 100 }
					]
				}
			])
		).toEqual([
			{ timeSeconds: 0, first: 10, second: 20 },
			{ timeSeconds: 2, first: 30, second: 60 },
			{ timeSeconds: 4, first: 50, second: 100 }
		]);
	});
});
