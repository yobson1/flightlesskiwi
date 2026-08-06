<script lang="ts">
	import {
		averageMetricValues,
		getBenchmarkChartColorIndex,
		hasNonZeroMetricValues,
		percentagesRelativeToMinimum,
		percentileMetricValue,
		stripFileExtension,
		type BenchmarkChartRun
	} from '$lib/benchmark-chart';
	import BenchmarkHorizontalBarChart from '$lib/components/benchmark-horizontal-bar-chart.svelte';

	interface Props {
		benchmarkId: string;
		runs: BenchmarkChartRun[];
	}

	let { benchmarkId, runs }: Props = $props();

	const chartData = $derived.by(() =>
		runs.flatMap((run) => {
			const fps = run.benchmarkRun?.data.metrics.find(({ key }) => key === 'fps');
			if (!fps || !hasNonZeroMetricValues(fps.values)) return [];

			const low = percentileMetricValue(fps.values, 0.01);
			const average = averageMetricValues(fps.values);
			const high = percentileMetricValue(fps.values, 0.97);
			return low === null || average === null || high === null
				? []
				: [{ run: stripFileExtension(run.originalName), low, average, high }];
		})
	);
	const series = [
		{ key: 'low', label: '1st percentile', value: 'low', colorIndex: 2 },
		{ key: 'average', label: 'Average', value: 'average', colorIndex: 0 },
		{ key: 'high', label: '97th percentile', value: 'high', colorIndex: 1 }
	];
	const relativeAverageData = $derived.by(() => {
		const percentages = percentagesRelativeToMinimum(chartData.map(({ average }) => average));
		return percentages.map((percentage, index) => ({
			run: chartData[index]!.run,
			percentage
		}));
	});
	const hasMultipleFpsRuns = $derived(
		runs.filter((run) => {
			const fps = run.benchmarkRun?.data.metrics.find(({ key }) => key === 'fps');
			return fps && hasNonZeroMetricValues(fps.values);
		}).length > 1
	);
	const relativeAverageSeries = $derived([
		{
			key: 'percentage',
			label: 'Relative average FPS',
			value: 'percentage',
			colorIndex: getBenchmarkChartColorIndex(benchmarkId, 'performance:relative-average-fps')
		}
	]);
</script>

<BenchmarkHorizontalBarChart
	title="FPS comparison"
	description="Low, average, and high frame rates for each run."
	data={chartData}
	{series}
	unit="FPS"
	chartClass="h-80"
	rightPadding={72}
	showLegend
/>

{#if hasMultipleFpsRuns}
	<BenchmarkHorizontalBarChart
		title="Average FPS comparison (%)"
		description="Average FPS relative to the slowest run, which is the 100% baseline."
		data={relativeAverageData}
		series={relativeAverageSeries}
		unit="%"
	/>
{/if}
