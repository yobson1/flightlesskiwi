<script lang="ts">
	import { LineChart } from 'layerchart';
	import {
		BENCHMARK_CHART_COLORS,
		formatBenchmarkMetricName,
		formatMetricValue,
		getBenchmarkMetricUnit,
		hasNonZeroMetricValues,
		type BenchmarkChartRun
	} from '$lib/benchmark-chart';
	import * as Chart from '$lib/components/ui/chart';

	interface Props {
		runs: BenchmarkChartRun[];
		metricKey: string;
		description?: string;
	}

	let { runs, metricKey, description }: Props = $props();

	const unit = $derived(getBenchmarkMetricUnit(metricKey));
	const title = $derived(formatBenchmarkMetricName(metricKey));
	const series = $derived.by(() =>
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
					value: 'value',
					data: points,
					color: BENCHMARK_CHART_COLORS[index % BENCHMARK_CHART_COLORS.length]
				}
			];
		})
	);
	const config = $derived(
		Object.fromEntries(
			series.map(({ key, label, color }) => [key, { label, color }])
		) satisfies Chart.ChartConfig
	);
</script>

{#snippet tooltipValue({ value, name }: { value: unknown; name: string })}
	<div class="flex min-w-0 flex-1 items-center justify-between gap-4">
		<span class="max-w-64 truncate text-muted-foreground">{name}</span>
		<span class="font-mono font-medium tabular-nums">
			{typeof value === 'number' ? formatMetricValue(value, unit) : String(value)}
		</span>
	</div>
{/snippet}

<article class="rounded-xl border bg-card p-4">
	<div>
		<h3 class="font-semibold">{title}</h3>
		<p class="text-sm text-muted-foreground">
			{description ?? `${title} throughout each benchmark run${unit ? ` (${unit})` : ''}.`}
		</p>
	</div>

	<Chart.Container {config} class="mt-4 aspect-auto h-72 w-full">
		<LineChart
			data={[]}
			x="timeSeconds"
			y="value"
			{series}
			legend={series.length > 1 ? { variant: 'swatches' } : false}
			props={{
				xAxis: { label: 'Time (seconds)' },
				yAxis: { label: unit || title },
				spline: { strokeWidth: 1.75 }
			}}
		>
			{#snippet tooltip()}
				<Chart.Tooltip
					formatter={tooltipValue}
					labelFormatter={(value) =>
						typeof value === 'number' ? `${formatMetricValue(value)} seconds` : String(value)}
				/>
			{/snippet}
		</LineChart>
	</Chart.Container>
</article>
