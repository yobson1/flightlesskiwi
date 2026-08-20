import type { BenchmarkMetric, BenchmarkMetricKey, BenchmarkRun } from '#lib/benchmark-run.js';
import * as v from 'valibot';

export interface BenchmarkChartRun {
	id: string;
	originalName: string;
	benchmarkRun: BenchmarkRun | null;
}

export interface MetricChartPoint {
	timeSeconds: number;
	value: number;
}

interface BenchmarkPieSlice {
	label: string;
	percentage: number;
}

interface FrametimeClassificationSlice extends BenchmarkPieSlice {
	durationSeconds: number;
}

interface FrametimeDistributionPoint {
	frametime: number;
	percentage: number;
}

const BENCHMARK_CHART_COLOR_COUNT = 8;
const validFrametimeSchema = v.pipe(v.number(), v.finite(), v.minValue(Number.MIN_VALUE));
export const LOW_FPS_THRESHOLD = 25;
export const STUTTER_FACTOR = 2.5;
export const FRAMETIME_DISTRIBUTION_BIN_SIZE = 0.1;

export function stripFileExtension(value: string): string {
	const lastSeparator = Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\'));
	const lastDot = value.lastIndexOf('.');
	return lastDot > lastSeparator + 1 && lastDot < value.length - 1
		? value.slice(0, lastDot)
		: value;
}

export function averageMetricValues(values: Array<number | null>): number | null {
	let total = 0;
	let count = 0;

	for (const value of values) {
		if (value === null) continue;
		total += value;
		count++;
	}

	return count === 0 ? null : total / count;
}

export function calculateFrametimeStability(values: Array<number | null>): {
	standardDeviation: number;
	p99Overhead: number;
} | null {
	const average = averageMetricValues(values);
	const [median = null, p99 = null] = percentileMetricValues(values, [0.5, 0.99]);

	if (
		average === null ||
		median === null ||
		p99 === null ||
		!Number.isFinite(average) ||
		!Number.isFinite(median) ||
		average <= 0 ||
		median <= 0
	) {
		return null;
	}

	let squaredDifferenceTotal = 0;
	let count = 0;
	for (const value of values) {
		if (value === null) continue;
		squaredDifferenceTotal += (value - average) ** 2;
		count++;
	}
	if (count === 0) return null;

	return {
		standardDeviation: (Math.sqrt(squaredDifferenceTotal / count) / average) * 100,
		p99Overhead: ((p99 - median) / median) * 100
	};
}

export function calculateFrametimeMovingAverage(
	values: Array<number | null>
): Array<number | null> {
	const validValues = values.filter((value) => v.is(validFrametimeSchema, value));
	if (validValues.length === 0) return values.map(() => null);

	const average = validValues.reduce((total, value) => total + value, 0) / validValues.length;
	const sampleSize = Math.max(1, Math.round(Math.sqrt(average) * 10));
	const movingAverage: Array<number | null> = [];
	const validHistory: number[] = [];

	for (const value of values) {
		if (!v.is(validFrametimeSchema, value)) {
			movingAverage.push(null);
			continue;
		}

		validHistory.push(value);
		const windowStart = Math.max(0, validHistory.length - sampleSize);
		let windowTotal = 0;
		for (let index = windowStart; index < validHistory.length; index++) {
			const current = validHistory[index]!;
			const previous = validHistory[index - 1];
			windowTotal += previous !== undefined && current > previous * 3 ? previous : current;
		}
		movingAverage.push(windowTotal / (validHistory.length - windowStart));
	}

	return movingAverage;
}

export function calculateFrametimeClassification(
	values: Array<number | null>,
	stutterFactor = STUTTER_FACTOR,
	lowFpsThreshold = LOW_FPS_THRESHOLD
): FrametimeClassificationSlice[] {
	const movingAverage = calculateFrametimeMovingAverage(values);
	const durationByLabel = new Map([
		['Smooth', 0],
		['Low FPS', 0],
		['Stuttering', 0]
	]);

	for (let index = 0; index < values.length; index++) {
		const value = values[index];
		const average = movingAverage[index];
		if (!v.is(validFrametimeSchema, value) || !v.is(validFrametimeSchema, average)) continue;

		const label =
			value > average * stutterFactor
				? 'Stuttering'
				: 1_000 / value < lowFpsThreshold
					? 'Low FPS'
					: 'Smooth';
		durationByLabel.set(label, durationByLabel.get(label)! + value);
	}

	const totalDuration = [...durationByLabel.values()].reduce((total, value) => total + value, 0);
	if (totalDuration === 0) return [];

	return [...durationByLabel].map(([label, duration]) => ({
		label,
		durationSeconds: duration / 1_000,
		percentage: (duration / totalDuration) * 100
	}));
}

export function calculateFrametimeVariance(values: Array<number | null>): BenchmarkPieSlice[] {
	const bins = [
		{ label: '< 2 ms', count: 0 },
		{ label: '2–4 ms', count: 0 },
		{ label: '4–8 ms', count: 0 },
		{ label: '8–12 ms', count: 0 },
		{ label: '≥ 12 ms', count: 0 }
	];
	let differenceCount = 0;

	for (let index = 1; index < values.length; index++) {
		const previous = values[index - 1];
		const current = values[index];
		if (!v.is(validFrametimeSchema, previous) || !v.is(validFrametimeSchema, current)) continue;

		const difference = Math.abs(current - previous);
		const binIndex =
			difference < 2 ? 0 : difference < 4 ? 1 : difference < 8 ? 2 : difference < 12 ? 3 : 4;
		bins[binIndex]!.count++;
		differenceCount++;
	}

	if (differenceCount === 0) return [];
	return bins.map(({ label, count }) => ({
		label,
		percentage: (count / differenceCount) * 100
	}));
}

export function calculateFrametimeDistribution(
	values: Array<number | null>
): FrametimeDistributionPoint[] {
	const validValues = values.filter((value) => v.is(validFrametimeSchema, value));
	const totalDuration = validValues.reduce((total, value) => total + value, 0);
	if (totalDuration === 0) return [];

	const durationByBin = new Map<number, number>();
	for (const value of validValues) {
		const binIndex = Math.floor(value / FRAMETIME_DISTRIBUTION_BIN_SIZE);
		durationByBin.set(binIndex, (durationByBin.get(binIndex) ?? 0) + value);
	}

	return [...durationByBin]
		.toSorted(([firstBin], [secondBin]) => firstBin - secondBin)
		.map(([binIndex, duration]) => ({
			frametime: Number(((binIndex + 1) * FRAMETIME_DISTRIBUTION_BIN_SIZE).toFixed(10)),
			percentage: (duration / totalDuration) * 100
		}));
}

export function hasNonZeroMetricValues(values: Array<number | null>): boolean {
	return values.some((value) => value !== null && value !== 0);
}

export function getBenchmarkRunMetric(
	run: BenchmarkChartRun,
	key: BenchmarkMetricKey
): BenchmarkMetric | undefined {
	const metric = run.benchmarkRun?.data.metrics.find((candidate) => candidate.key === key);
	return metric && hasNonZeroMetricValues(metric.values) ? metric : undefined;
}

export function percentagesRelativeToMinimum(values: readonly number[]): number[] {
	if (values.length === 0 || values.some((value) => !Number.isFinite(value) || value <= 0)) {
		return [];
	}

	const baseline = Math.min(...values);
	return values.map((value) => (value / baseline) * 100);
}

export function getBenchmarkChartColorIndex(benchmarkId: string, chartKey: string): number {
	const seed = `${benchmarkId}:${chartKey}`;
	let hash = 2_166_136_261;

	for (let index = 0; index < seed.length; index++) {
		hash ^= seed.charCodeAt(index);
		hash = Math.imul(hash, 16_777_619);
	}

	return (hash >>> 0) % BENCHMARK_CHART_COLOR_COUNT;
}

export function sortBenchmarkChartRunsByAverageFps(
	runs: readonly BenchmarkChartRun[]
): BenchmarkChartRun[] {
	return runs
		.map((run, index) => {
			const fps = getBenchmarkRunMetric(run, 'fps');
			const average = fps ? averageMetricValues(fps.values) : null;
			return {
				run,
				index,
				average: average !== null && Number.isFinite(average) && average > 0 ? average : null
			};
		})
		.toSorted((first, second) => {
			if (first.average === null) {
				return second.average === null ? first.index - second.index : 1;
			}
			if (second.average === null) return -1;
			return first.average - second.average || first.index - second.index;
		})
		.map(({ run }) => run);
}

export function buildMetricChartPoints(
	timeSeconds: readonly number[],
	values: ReadonlyArray<number | null>,
	maximumPoints = 3_000
): MetricChartPoint[] {
	if (!Number.isSafeInteger(maximumPoints) || maximumPoints < 2) {
		throw new RangeError('maximumPoints must be an integer of at least 2');
	}

	let firstIndex = -1;
	let lastIndex = -1;
	let valueCount = 0;
	for (let index = 0; index < values.length; index++) {
		if (values[index] === null || values[index] === undefined) continue;
		if (firstIndex === -1) firstIndex = index;
		lastIndex = index;
		valueCount++;
	}
	const finish = (points: MetricChartPoint[]) => {
		const retainedPoints = removeRedundantMetricChartPoints(points);
		console.info(
			`buildMetricChartPoints: had ${valueCount} points, returning ${retainedPoints.length}, discarded ${valueCount - retainedPoints.length}`
		);
		return retainedPoints;
	};
	if (firstIndex === -1 || lastIndex === -1) return finish([]);

	const point = (index: number) => ({
		timeSeconds: timeSeconds[index] ?? index,
		value: values[index]!
	});
	if (valueCount <= maximumPoints) {
		return finish(values.flatMap((value, index) => (value === null ? [] : [point(index)])));
	}
	if (maximumPoints < 4) return finish([point(firstIndex), point(lastIndex)]);

	const points = [point(firstIndex)];
	const bucketCount = Math.floor((maximumPoints - 2) / 2);
	const innerStart = firstIndex + 1;
	const innerLength = Math.max(0, lastIndex - innerStart);

	for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex++) {
		const start = innerStart + Math.floor((innerLength * bucketIndex) / bucketCount);
		const end = innerStart + Math.floor((innerLength * (bucketIndex + 1)) / bucketCount);
		let minimumIndex = -1;
		let maximumIndex = -1;

		for (let index = start; index < end; index++) {
			const value = values[index];
			if (value === null || value === undefined) continue;
			if (minimumIndex === -1 || value < values[minimumIndex]!) minimumIndex = index;
			if (maximumIndex === -1 || value > values[maximumIndex]!) maximumIndex = index;
		}

		if (minimumIndex === -1 || maximumIndex === -1) continue;
		if (minimumIndex === maximumIndex) points.push(point(minimumIndex));
		else if (minimumIndex < maximumIndex) points.push(point(minimumIndex), point(maximumIndex));
		else points.push(point(maximumIndex), point(minimumIndex));
	}

	points.push(point(lastIndex));
	return finish(points);
}

export function findMetricChartPointAtOrBefore(
	points: readonly MetricChartPoint[],
	timeSeconds: number
): MetricChartPoint | undefined {
	const first = points[0];
	const last = points.at(-1);
	if (
		!first ||
		!last ||
		!Number.isFinite(timeSeconds) ||
		timeSeconds < first.timeSeconds ||
		timeSeconds > last.timeSeconds
	) {
		return undefined;
	}

	let lowerIndex = 0;
	let upperIndex = points.length - 1;
	while (lowerIndex < upperIndex) {
		const middleIndex = Math.ceil((lowerIndex + upperIndex) / 2);
		if (points[middleIndex]!.timeSeconds <= timeSeconds) lowerIndex = middleIndex;
		else upperIndex = middleIndex - 1;
	}

	return points[lowerIndex];
}

function removeRedundantMetricChartPoints(points: MetricChartPoint[]): MetricChartPoint[] {
	if (points.length <= 2) return points;

	const retainedPoints = [points[0]!];
	for (let index = 1; index < points.length - 1; index++) {
		const previous = points[index - 1]!;
		const current = points[index]!;
		const next = points[index + 1]!;
		if (current.value !== previous.value || current.value !== next.value) {
			retainedPoints.push(current);
		}
	}
	retainedPoints.push(points.at(-1)!);
	return retainedPoints;
}

export function percentileMetricValues(
	values: Array<number | null>,
	percentiles: readonly number[]
): Array<number | null> {
	const sorted = values
		.filter((value): value is number => value !== null)
		.toSorted((a, b) => a - b);
	if (sorted.length === 0) return percentiles.map(() => null);
	if (sorted.length === 1) return percentiles.map(() => sorted[0]!);

	return percentiles.map((percentile) => {
		const position = Math.min(1, Math.max(0, percentile)) * (sorted.length - 1);
		const lowerIndex = Math.floor(position);
		const upperIndex = Math.ceil(position);
		const lower = sorted[lowerIndex]!;
		const upper = sorted[upperIndex]!;

		return lower + (upper - lower) * (position - lowerIndex);
	});
}

export function formatMetricValue(value: number, unit = ''): string {
	const maximumFractionDigits = Math.abs(value) >= 100 ? 1 : 2;
	const formatted = new Intl.NumberFormat('en', { maximumFractionDigits }).format(value);
	if (!unit) return formatted;
	return unit === '%' ? `${formatted}%` : `${formatted} ${unit}`;
}
