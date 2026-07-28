<script lang="ts">
	import {
		averageMetricValues,
		getBenchmarkChartColorIndex,
		hasNonZeroMetricValues,
		stripFileExtension,
		type BenchmarkChartRun
	} from '$lib/benchmark-chart';
	import type { BenchmarkMetric } from '$lib/benchmark-run';
	import BenchmarkHorizontalBarChart from '$lib/components/benchmark-horizontal-bar-chart.svelte';

	interface Props {
		benchmarkId: string;
		runs: BenchmarkChartRun[];
		metric: BenchmarkMetric;
	}

	let { benchmarkId, runs, metric }: Props = $props();

	const title = $derived(metric.prettyName);
	const unit = $derived(metric.unit);
	const chartData = $derived.by(() =>
		runs.flatMap((run) => {
			const runMetric = run.benchmarkRun?.data.metrics.find(({ key }) => key === metric.key);
			if (!runMetric || !hasNonZeroMetricValues(runMetric.values)) return [];
			const average = averageMetricValues(runMetric.values);
			return average === null ? [] : [{ run: stripFileExtension(run.originalName), average }];
		})
	);
	const series = $derived([
		{
			key: 'average',
			label: `Average ${title}`,
			value: 'average',
			colorIndex: getBenchmarkChartColorIndex(benchmarkId, `summary:${metric.key}`)
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
