import { describe, expect, test } from 'bun:test';
import {
	averageMetricValues,
	buildMetricChartPoints,
	calculateFrametimeClassification,
	calculateFrametimeDistribution,
	calculateFrametimeMovingAverage,
	calculateFrametimeStability,
	calculateFrametimeVariance,
	findMetricChartPointAtOrBefore,
	formatMetricValue,
	getBenchmarkChartColorIndex,
	getBenchmarkRunMetric,
	hasNonZeroMetricValues,
	percentagesRelativeToMinimum,
	percentileMetricValues,
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
		expect(percentileMetricValues([0, null, 100], [0.25, 0.75])).toEqual([25, 75]);
		expect(averageMetricValues([null])).toBe(null);
		expect(percentileMetricValues([], [0.5])).toEqual([null]);
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

	test('calculates the CapFrameX-style moving average and suppresses large spikes', () => {
		const values = [10, 10, null, 40];

		expect(calculateFrametimeMovingAverage(values)).toEqual([10, 10, null, 10]);
		expect(calculateFrametimeMovingAverage([null, 0])).toEqual([null, null]);
	});

	test('classifies smooth, low FPS, and stuttering time with CapFrameX defaults', () => {
		const classification = calculateFrametimeClassification([10, 10, 50, 30]);

		expect(classification.map(({ label }) => label)).toEqual(['Smooth', 'Low FPS', 'Stuttering']);
		expect(classification[0]?.durationSeconds).toBeCloseTo(0.05);
		expect(classification[1]?.durationSeconds).toBe(0);
		expect(classification[2]?.durationSeconds).toBeCloseTo(0.05);
		expect(classification[0]?.percentage).toBeCloseTo(50);
		expect(classification[2]?.percentage).toBeCloseTo(50);
		expect(calculateFrametimeClassification([50, 50])).toEqual([
			{ label: 'Smooth', durationSeconds: 0, percentage: 0 },
			{ label: 'Low FPS', durationSeconds: 0.1, percentage: 100 },
			{ label: 'Stuttering', durationSeconds: 0, percentage: 0 }
		]);
	});

	test('groups consecutive frametime differences into CapFrameX variance buckets', () => {
		expect(calculateFrametimeVariance([10, 11, 14, 20, 30, 45])).toEqual([
			{ label: '< 2 ms', percentage: 20 },
			{ label: '2–4 ms', percentage: 20 },
			{ label: '4–8 ms', percentage: 20 },
			{ label: '8–12 ms', percentage: 20 },
			{ label: '≥ 12 ms', percentage: 20 }
		]);
		expect(calculateFrametimeVariance([10, null, 12])).toEqual([]);
	});

	test('builds a time-weighted frametime distribution in 0.1 ms bins', () => {
		expect(calculateFrametimeDistribution([1.01, 1.09, 1.11, null])).toEqual([
			{ frametime: 1.1, percentage: (2.1 / 3.21) * 100 },
			{ frametime: 1.2, percentage: (1.11 / 3.21) * 100 }
		]);
	});

	test('distinguishes captured metrics from all-zero placeholder data', () => {
		expect(hasNonZeroMetricValues([null, 0, 0])).toBe(false);
		expect(hasNonZeroMetricValues([null, 0, 0.01])).toBe(true);
		expect(hasNonZeroMetricValues([-1, 0])).toBe(true);
	});

	test('finds captured metrics on chart runs', () => {
		const benchmarkRun = parsedBenchmarkRun([0, 60]);
		const run = { id: 'run-1', originalName: 'run.csv', benchmarkRun };

		expect(getBenchmarkRunMetric(run, 'fps')).toBe(benchmarkRun.data.metrics[0]);
		expect(getBenchmarkRunMetric(run, 'frametime')).toBeUndefined();
		expect(
			getBenchmarkRunMetric({ ...run, benchmarkRun: parsedBenchmarkRun([0, 0]) }, 'fps')
		).toBeUndefined();
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

	test('bounds line chart points while retaining time order and bucket extrema', () => {
		expect(buildMetricChartPoints([0, 1, 2], [10, null, 30], 3)).toEqual([
			{ timeSeconds: 0, value: 10 },
			{ timeSeconds: 2, value: 30 }
		]);
		expect(buildMetricChartPoints([0, 1, 2, 3, 4, 5], [0, 4, 2, 3, 1, 5], 4)).toEqual([
			{ timeSeconds: 0, value: 0 },
			{ timeSeconds: 1, value: 4 },
			{ timeSeconds: 4, value: 1 },
			{ timeSeconds: 5, value: 5 }
		]);
		expect(buildMetricChartPoints([0, 1, 2, 3], [0, 1, 2, 3], 3)).toHaveLength(2);
		expect(() => buildMetricChartPoints([], [], 1)).toThrow(RangeError);
	});

	test('retains only the endpoints and transitions of constant-value runs', () => {
		expect(buildMetricChartPoints([0, 1, 2, 3, 4, 5], [98, 98, 98, 98, 97, 97])).toEqual([
			{ timeSeconds: 0, value: 98 },
			{ timeSeconds: 3, value: 98 },
			{ timeSeconds: 4, value: 97 },
			{ timeSeconds: 5, value: 97 }
		]);
		expect(
			buildMetricChartPoints([0, 1, 2, 3, 4, 5, 6, 7], [98, 98, 98, 98, 98, 98, 98, 98], 4)
		).toEqual([
			{ timeSeconds: 0, value: 98 },
			{ timeSeconds: 7, value: 98 }
		]);
	});

	test('finds the most recent chart point only within a series time range', () => {
		const points = [
			{ timeSeconds: 1, value: 10 },
			{ timeSeconds: 3, value: 30 },
			{ timeSeconds: 5, value: 50 }
		];

		expect(findMetricChartPointAtOrBefore(points, 3)).toBe(points[1]);
		expect(findMetricChartPointAtOrBefore(points, 4)).toBe(points[1]);
		expect(findMetricChartPointAtOrBefore(points, 0)).toBeUndefined();
		expect(findMetricChartPointAtOrBefore(points, 6)).toBeUndefined();
		expect(findMetricChartPointAtOrBefore([], 3)).toBeUndefined();
	});
});
