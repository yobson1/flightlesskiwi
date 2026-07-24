<script lang="ts" module>
	function truncateMiddle(value: string, maximumCharacters: number): string {
		if (value.length <= maximumCharacters) return value;
		const visibleCharacters = Math.max(2, maximumCharacters - 1);
		const startLength = Math.ceil(visibleCharacters / 2);
		const endLength = Math.floor(visibleCharacters / 2);
		return `${value.slice(0, startLength)}…${value.slice(-endLength)}`;
	}
</script>

<script lang="ts">
	import { formatMetricValue } from '$lib/benchmark-chart';
	import BenchmarkChartCard from '$lib/components/benchmark-chart-card.svelte';
	import BenchmarkEChart from '$lib/components/benchmark-echart.svelte';
	import type { BenchmarkEChartOption, BenchmarkEChartTheme } from '$lib/benchmark-echart';

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
		unit = '',
		chartClass = 'h-64',
		leftPadding = 144,
		rightPadding = 88,
		maxLabelCharacters = 20,
		showLegend = false
	}: Props = $props();

	const createOption = $derived((theme: BenchmarkEChartTheme): BenchmarkEChartOption => ({
		animation: false,
		aria: { enabled: true },
		color: series.map(
			({ colorIndex }) => theme.colors[colorIndex % theme.colors.length] ?? theme.foreground
		),
		grid: {
			bottom: showLegend ? 52 : 40,
			containLabel: false,
			left: leftPadding,
			right: rightPadding,
			top: 8
		},
		legend: {
			bottom: 0,
			icon: 'roundRect',
			itemHeight: 10,
			itemWidth: 10,
			show: showLegend,
			textStyle: { color: theme.mutedForeground }
		},
		tooltip: {
			appendToBody: true,
			axisPointer: {
				type: 'shadow',
				shadowStyle: { color: theme.border, opacity: 0.35 }
			},
			backgroundColor: theme.background,
			borderColor: theme.border,
			confine: true,
			textStyle: { color: theme.foreground },
			trigger: 'axis',
			valueFormatter: (value: unknown) =>
				typeof value === 'number' ? formatMetricValue(value, unit) : String(value)
		},
		xAxis: {
			axisLabel: { color: theme.mutedForeground },
			axisLine: { show: false },
			axisTick: { show: false },
			name: unit || title,
			nameGap: 24,
			nameLocation: 'middle',
			nameTextStyle: { color: theme.mutedForeground },
			splitLine: { lineStyle: { color: theme.border } },
			type: 'value'
		},
		yAxis: {
			axisLabel: {
				color: theme.mutedForeground,
				formatter: (value: string) => truncateMiddle(value, maxLabelCharacters)
			},
			axisLine: { show: false },
			axisTick: { show: false },
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
					typeof labelValue === 'number' ? formatMetricValue(labelValue, unit) : String(labelValue),
				position: 'right',
				show: true
			},
			name: label,
			type: 'bar'
		}))
	}));
</script>

<BenchmarkChartCard {title} {description} {chartClass}>
	<BenchmarkEChart ariaLabel={`${title} chart`} class="h-full" {createOption} />
</BenchmarkChartCard>
