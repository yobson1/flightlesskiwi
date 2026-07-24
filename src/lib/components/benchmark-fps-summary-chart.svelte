<script lang="ts">
	import { BarChart } from 'layerchart';
	import {
		averageMetricValues,
		formatMetricValue,
		hasNonZeroMetricValues,
		percentileMetricValue,
		type BenchmarkChartRun
	} from '$lib/benchmark-chart';
	import * as Chart from '$lib/components/ui/chart';

	interface Props {
		runs: BenchmarkChartRun[];
	}

	let { runs }: Props = $props();

	const chartData = $derived.by(() =>
		runs.flatMap((run) => {
			const fps = run.mangoHudData?.metrics.find(({ key }) => key === 'fps');
			if (!fps || !hasNonZeroMetricValues(fps.values)) return [];

			const low = percentileMetricValue(fps.values, 0.01);
			const average = averageMetricValues(fps.values);
			const high = percentileMetricValue(fps.values, 0.97);
			return low === null || average === null || high === null
				? []
				: [{ run: run.originalName, low, average, high }];
		})
	);
	const series = [
		{ key: 'low', label: '1st percentile', value: 'low', color: 'var(--chart-3)' },
		{ key: 'average', label: 'Average', value: 'average', color: 'var(--chart-1)' },
		{ key: 'high', label: '97th percentile', value: 'high', color: 'var(--chart-2)' }
	];
	const config = {
		low: { label: '1st percentile', color: 'var(--chart-3)' },
		average: { label: 'Average', color: 'var(--chart-1)' },
		high: { label: '97th percentile', color: 'var(--chart-2)' }
	} satisfies Chart.ChartConfig;
</script>

{#snippet tooltipValue({ value, name }: { value: unknown; name: string })}
	<div class="flex min-w-0 flex-1 items-center justify-between gap-4">
		<span class="text-muted-foreground">{name}</span>
		<span class="font-mono font-medium tabular-nums">
			{typeof value === 'number' ? formatMetricValue(value, 'FPS') : String(value)}
		</span>
	</div>
{/snippet}

<article class="rounded-xl border bg-card p-4">
	<h3 class="font-semibold">FPS comparison</h3>
	<p class="text-sm text-muted-foreground">Low, average, and high frame rates for each run.</p>

	<Chart.Container {config} class="mt-4 aspect-auto h-80 w-full">
		<BarChart
			data={chartData}
			orientation="horizontal"
			x={series.map(({ value }) => value)}
			y="run"
			{series}
			seriesLayout="group"
			legend={{ variant: 'swatches' }}
			labels={{
				placement: 'outside',
				offset: 6,
				format: (value) => formatMetricValue(value, 'FPS')
			}}
			padding={{ left: 168, right: 72 }}
			props={{
				xAxis: { label: 'FPS' },
				yAxis: {
					tickLabelProps: {
						truncate: { maxChars: 24, position: 'middle' }
					}
				}
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
