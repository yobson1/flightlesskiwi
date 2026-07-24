<script lang="ts">
	import {
		averageMetricValues,
		formatBenchmarkMetricName,
		getBenchmarkMetricUnit,
		hasNonZeroMetricValues,
		type BenchmarkChartRun
	} from '$lib/benchmark-chart';
	import BenchmarkHorizontalBarChart from '$lib/components/benchmark-horizontal-bar-chart.svelte';

	interface Props {
		runs: BenchmarkChartRun[];
		metricKey: string;
	}

	let { runs, metricKey }: Props = $props();

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
	const config = $derived({
		average: {
			label: `Average ${title}`,
			color: 'var(--chart-1)'
		}
	});
	const series = $derived([
		{
			key: 'average',
			label: `Average ${title}`,
			value: 'average',
			color: 'var(--chart-1)'
		}
	]);
</script>

<BenchmarkHorizontalBarChart
	{title}
	description={`Average per run${unit ? ` (${unit})` : ''}.`}
	data={chartData}
	{series}
	{config}
	{unit}
/>
