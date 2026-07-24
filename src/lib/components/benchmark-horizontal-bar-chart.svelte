<script lang="ts">
	import { BarChart } from 'layerchart';
	import { formatMetricValue } from '$lib/benchmark-chart';
	import BenchmarkChartCard from '$lib/components/benchmark-chart-card.svelte';
	import BenchmarkChartTooltip from '$lib/components/benchmark-chart-tooltip.svelte';
	import type { ChartConfig } from '$lib/components/ui/chart';

	interface BenchmarkBarDatum {
		run: string;
		[key: string]: string | number;
	}

	interface BenchmarkBarSeries {
		key: string;
		label: string;
		value: string;
		color: string;
	}

	interface Props {
		title: string;
		description: string;
		data: BenchmarkBarDatum[];
		series: BenchmarkBarSeries[];
		config: ChartConfig;
		unit?: string;
		chartClass?: string;
		leftPadding?: number;
		rightPadding?: number;
		maxLabelCharacters?: number;
		showLegend?: boolean;
	}

	let {
		title,
		description,
		data,
		series,
		config,
		unit = '',
		chartClass = 'h-64',
		leftPadding = 144,
		rightPadding = 88,
		maxLabelCharacters = 20,
		showLegend = false
	}: Props = $props();

	const xAccessor = $derived(
		series.length === 1 ? (series[0]?.value ?? series[0]?.key) : series.map(({ value }) => value)
	);
</script>

<BenchmarkChartCard {title} {description} {config} {chartClass}>
	<BarChart
		{data}
		orientation="horizontal"
		x={xAccessor}
		y="run"
		{series}
		seriesLayout={series.length > 1 ? 'group' : 'overlap'}
		legend={showLegend ? { variant: 'swatches' } : false}
		labels={{
			placement: 'outside',
			offset: 6,
			format: (value) => formatMetricValue(value, unit)
		}}
		padding={{
			left: leftPadding,
			right: rightPadding,
			bottom: showLegend ? 52 : 44
		}}
		props={{
			xAxis: {
				label: unit || title,
				labelProps: showLegend ? { dy: -24 } : undefined
			},
			yAxis: {
				tickLabelProps: {
					truncate: { maxChars: maxLabelCharacters, position: 'middle' }
				}
			}
		}}
	>
		{#snippet tooltip({ context })}
			<BenchmarkChartTooltip {unit} label={context.tooltip.data?.run ?? 'Benchmark run'} />
		{/snippet}
	</BarChart>
</BenchmarkChartCard>
