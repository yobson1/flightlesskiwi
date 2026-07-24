<script lang="ts">
	import { LineChart } from 'layerchart';
	import {
		BENCHMARK_CHART_COLORS,
		buildSharedMetricChartData,
		formatBenchmarkMetricName,
		formatMetricValue,
		getBenchmarkMetricUnit,
		hasNonZeroMetricValues,
		type BenchmarkChartRun
	} from '$lib/benchmark-chart';
	import BenchmarkChartCard from '$lib/components/benchmark-chart-card.svelte';
	import BenchmarkChartTooltip from '$lib/components/benchmark-chart-tooltip.svelte';
	import * as Chart from '$lib/components/ui/chart';

	interface Props {
		runs: BenchmarkChartRun[];
		metricKey: string;
		description?: string;
	}

	let { runs, metricKey, description }: Props = $props();

	const unit = $derived(getBenchmarkMetricUnit(metricKey));
	const title = $derived(formatBenchmarkMetricName(metricKey));
	const metricSeries = $derived.by(() =>
		runs.flatMap((run, index) => {
			const metric = run.mangoHudData?.metrics.find(({ key }) => key === metricKey);
			if (!metric || !run.mangoHudData || !hasNonZeroMetricValues(metric.values)) return [];

			const points = metric.values.flatMap((value, pointIndex) =>
				value === null
					? []
					: [{ timeSeconds: run.mangoHudData!.timeSeconds[pointIndex] ?? pointIndex, value }]
			);
			if (points.length === 0) return [];

			return [
				{
					key: run.id,
					label: run.originalName,
					points,
					color: BENCHMARK_CHART_COLORS[index % BENCHMARK_CHART_COLORS.length]
				}
			];
		})
	);
	const series = $derived(
		metricSeries.map(({ key, label, color }) => ({
			key,
			label,
			color
		}))
	);
	const chartData = $derived(buildSharedMetricChartData(metricSeries));
	const config = $derived(
		Object.fromEntries(
			series.map(({ key, label, color }) => [key, { label, color }])
		) satisfies Chart.ChartConfig
	);
	const hasLegend = $derived(series.length > 1);
</script>

<BenchmarkChartCard
	{title}
	description={description ?? `${title} throughout each benchmark run${unit ? ` (${unit})` : ''}.`}
	{config}
	chartClass="h-72"
>
	<LineChart
		data={chartData}
		x="timeSeconds"
		{series}
		legend={hasLegend ? { variant: 'swatches' } : false}
		padding={{
			left: 52,
			right: 12,
			bottom: hasLegend ? 76 : 44
		}}
		props={{
			xAxis: {
				label: 'Time (seconds)',
				// LayerChart anchors both the bottom legend and the X-axis label to the
				// bottom of the chart. Lift the label into the reserved padding so the
				// swatches have their own row.
				labelProps: hasLegend ? { dy: -24 } : undefined
			},
			yAxis: { label: unit || title },
			spline: { strokeWidth: 1.75 }
		}}
	>
		{#snippet tooltip()}
			<BenchmarkChartTooltip
				{unit}
				labelFormatter={(value) =>
					typeof value === 'number' ? `${formatMetricValue(value)} seconds` : String(value)}
			/>
		{/snippet}
	</LineChart>
</BenchmarkChartCard>
