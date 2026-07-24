<script lang="ts">
	import { BarChart } from 'layerchart';
	import {
		averageMetricValues,
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
	} satisfies Chart.ChartConfig);
</script>

{#snippet tooltipValue({ value, name }: { value: unknown; name: string })}
	<div class="flex min-w-0 flex-1 items-center justify-between gap-4">
		<span class="text-muted-foreground">{name}</span>
		<span class="font-mono font-medium tabular-nums">
			{typeof value === 'number' ? formatMetricValue(value, unit) : String(value)}
		</span>
	</div>
{/snippet}

<article class="rounded-xl border bg-card p-4">
	<h3 class="font-semibold">{title}</h3>
	<p class="text-sm text-muted-foreground">Average per run{unit ? ` (${unit})` : ''}.</p>

	<Chart.Container {config} class="mt-4 aspect-auto h-64 w-full">
		<BarChart
			data={chartData}
			orientation="horizontal"
			x="average"
			y="run"
			series={[{ key: 'average', label: `Average ${title}`, value: 'average' }]}
			labels={{
				placement: 'outside',
				offset: 6,
				format: (value) => formatMetricValue(value, unit)
			}}
			padding={{ left: 144, right: 88 }}
			props={{
				xAxis: { label: unit || title },
				yAxis: {
					tickLabelProps: {
						truncate: { maxChars: 20, position: 'middle' }
					}
				},
				bars: { fill: 'var(--color-average)' }
			}}
		>
			{#snippet tooltip({ context })}
				<Chart.Tooltip
					formatter={tooltipValue}
					label={context.tooltip.data?.run ?? 'Benchmark run'}
				/>
			{/snippet}
		</BarChart>
	</Chart.Container>
</article>
