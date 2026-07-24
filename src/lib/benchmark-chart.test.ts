import { describe, expect, test } from 'bun:test';
import {
	averageMetricValues,
	buildSharedMetricChartData,
	formatBenchmarkMetricName,
	formatMetricValue,
	getBenchmarkMetricUnit,
	hasNonZeroMetricValues,
	percentagesRelativeToMinimum,
	percentileMetricValue
} from './benchmark-chart';

describe('benchmark chart metric helpers', () => {
	test('formats known acronyms and title-cases other metric words', () => {
		expect(formatBenchmarkMetricName('fps')).toBe('FPS');
		expect(formatBenchmarkMetricName('cpu_load')).toBe('CPU Load');
		expect(formatBenchmarkMetricName('gpu_vram_used')).toBe('GPU VRAM Used');
		expect(formatBenchmarkMetricName('frametime')).toBe('Frametime');
	});

	test('provides units for known MangoHud metrics', () => {
		expect(getBenchmarkMetricUnit('frametime')).toBe('ms');
		expect(getBenchmarkMetricUnit('gpu_temp')).toBe('°C');
		expect(getBenchmarkMetricUnit('unknown_metric')).toBe('');
		expect(formatMetricValue(110, '%')).toBe('110%');
	});

	test('calculates averages and interpolated percentiles while ignoring missing samples', () => {
		expect(averageMetricValues([10, null, 20])).toBe(15);
		expect(percentileMetricValue([0, null, 100], 0.25)).toBe(25);
		expect(averageMetricValues([null])).toBe(null);
		expect(percentileMetricValue([], 0.5)).toBe(null);
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
