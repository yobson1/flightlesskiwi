<script lang="ts">
	import {
		averageMetricValues,
		formatBenchmarkMetricName,
		getBenchmarkChartColorIndex,
		getBenchmarkMetricUnit,
		hasNonZeroMetricValues,
		type BenchmarkChartRun
	} from '$lib/benchmark-chart';
	import BenchmarkHorizontalBarChart from '$lib/components/benchmark-horizontal-bar-chart.svelte';

	interface Props {
		benchmarkId: string;
		runs: BenchmarkChartRun[];
		metricKey: string;
	}

	let { benchmarkId, runs, metricKey }: Props = $props();

	const title = $derived(formatBenchmarkMetricName(metricKey));
	const unit = $derived(getBenchmarkMetricUnit(metricKey));
	const chartData = $derived.by(() =>
		runs.flatMap((run) => {
			const metric = run.mangoHudData?.metrics.find(({ key }) => key === metricKey);
			if (!metric || !hasNonZeroMetricValues(metric.values)) return [];
			const average = averageMetricValues(metric.values);
			return average === null ? [] : [{ run: run.originalName, average }];
		})
	);
	const series = $derived([
		{
			key: 'average',
			label: `Average ${title}`,
			value: 'average',
			colorIndex: getBenchmarkChartColorIndex(benchmarkId, `summary:${metricKey}`)
		}
	]);
</script>

<BenchmarkHorizontalBarChart
	{title}
	description={`Average per run${unit ? ` (${unit})` : ''}.`}
	data={chartData}
	{series}
	{unit}
/>
