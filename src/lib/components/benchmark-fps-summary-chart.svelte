<script lang="ts">
	import {
		averageMetricValues,
		getBenchmarkChartColorIndex,
		getBenchmarkRunMetric,
		percentagesRelativeToMinimum,
		percentileMetricValues,
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
			const fps = getBenchmarkRunMetric(run, 'fps');
			if (!fps) return [];

			const [low = null, high = null] = percentileMetricValues(fps.values, [0.01, 0.97]);
			const average = averageMetricValues(fps.values);
			return low === null || average === null || high === null
				? []
				: [{ run: stripFileExtension(run.originalName), low, average, high }];
		})
	);
	const series = [
		{ label: '1st percentile', value: 'low', colorIndex: 2 },
		{ label: 'Average', value: 'average', colorIndex: 0 },
		{ label: '97th percentile', value: 'high', colorIndex: 1 }
	];
	const relativeAverageData = $derived.by(() => {
		const percentages = percentagesRelativeToMinimum(chartData.map(({ average }) => average));
		return percentages.map((percentage, index) => ({
			run: chartData[index]!.run,
			percentage
		}));
	});
	const hasMultipleFpsRuns = $derived(
		runs.filter((run) => getBenchmarkRunMetric(run, 'fps')).length > 1
	);
	const relativeAverageSeries = $derived([
		{
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
