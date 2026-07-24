<script lang="ts">
	import { formatMetricValue } from '$lib/benchmark-chart';
	import BenchmarkChartCard from '$lib/components/benchmark-chart-card.svelte';
	import {
		getBenchmarkEChartAxis,
		getBenchmarkEChartBaseOption,
		getBenchmarkEChartLegend,
		getBenchmarkEChartSeriesColor,
		type BenchmarkEChartOption,
		type BenchmarkEChartTheme
	} from '$lib/benchmark-echart';

	interface BenchmarkBarDatum {
		run: string;
		[key: string]: string | number;
	}

	interface BenchmarkBarSeries {
		key: string;
		label: string;
		value: string;
		colorIndex: number;
	}

	interface Props {
		title: string;
		description: string;
		data: BenchmarkBarDatum[];
		series: BenchmarkBarSeries[];
		unit?: string;
		chartClass?: string;
		rightPadding?: number;
		showLegend?: boolean;
	}

	let {
		title,
		description,
		data,
		series,
		unit = '',
		chartClass = 'h-64',
		rightPadding = 88,
		showLegend = false
	}: Props = $props();

	const createOption = $derived((theme: BenchmarkEChartTheme): BenchmarkEChartOption => {
		const baseOption = getBenchmarkEChartBaseOption(theme);
		return {
			...baseOption,
			color: series.map(({ colorIndex }) => getBenchmarkEChartSeriesColor(theme, colorIndex)),
			grid: {
				bottom: showLegend ? 64 : 40,
				containLabel: true,
				left: 16,
				right: rightPadding,
				top: 8
			},
			legend: {
				...getBenchmarkEChartLegend(theme),
				bottom: 0,
				show: showLegend
			},
			tooltip: {
				...baseOption.tooltip,
				axisPointer: {
					type: 'shadow',
					shadowStyle: { color: theme.border, opacity: 0.35 }
				},
				trigger: 'axis',
				valueFormatter: (value: unknown) =>
					typeof value === 'number' ? formatMetricValue(value, unit) : String(value)
			},
			xAxis: {
				...getBenchmarkEChartAxis(theme),
				name: unit || title,
				nameGap: 24,
				nameLocation: 'middle',
				type: 'value'
			},
			yAxis: {
				...getBenchmarkEChartAxis(theme),
				data: data.map(({ run }) => run),
				inverse: true,
				type: 'category'
			},
			series: series.map(({ label, value }) => ({
				barMaxWidth: 28,
				data: data.map((datum) => datum[value]),
				emphasis: { focus: 'series' },
				label: {
					color: theme.foreground,
					formatter: ({ value: labelValue }: { value: unknown }) =>
						typeof labelValue === 'number'
							? formatMetricValue(labelValue, unit)
							: String(labelValue),
					position: 'right',
					show: true
				},
				name: label,
				type: 'bar'
			}))
		};
	});
</script>

<BenchmarkChartCard
	{title}
	{description}
	{chartClass}
	ariaLabel={`${title} chart`}
	{createOption}
/>
