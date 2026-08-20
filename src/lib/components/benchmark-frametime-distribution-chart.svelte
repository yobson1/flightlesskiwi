<script lang="ts">
	import {
		calculateFrametimeDistribution,
		FRAMETIME_DISTRIBUTION_BIN_SIZE,
		formatMetricValue,
		getBenchmarkRunMetric,
		stripFileExtension,
		type BenchmarkChartRun
	} from '#lib/benchmark-chart.js';
	import BenchmarkChartCard from '#lib/components/benchmark-chart-card.svelte';
	import {
		getBenchmarkEChartAxis,
		getBenchmarkEChartBaseOption,
		getBenchmarkEChartPlotTooltip,
		getBenchmarkEChartPlotXAxis,
		getBenchmarkEChartSeriesColor,
		getBenchmarkEChartZoomablePlotOption,
		type BenchmarkEChartOption,
		type BenchmarkEChartTheme
	} from '#lib/benchmark-echart.js';
	import type { DefaultLabelFormatterCallbackParams } from 'echarts';

	type EChartValue = DefaultLabelFormatterCallbackParams['value'];

	interface Props {
		runs: BenchmarkChartRun[];
	}

	let { runs }: Props = $props();

	const series = $derived.by(() =>
		runs.flatMap((run) => {
			const frametime = getBenchmarkRunMetric(run, 'frametime');
			if (!frametime) return [];

			const data = calculateFrametimeDistribution(frametime.values);
			return data.length === 0 ? [] : [{ label: stripFileExtension(run.originalName), data }];
		})
	);
	const hasLegend = $derived(series.length > 1);
	const hasData = $derived(runs.some((run) => getBenchmarkRunMetric(run, 'frametime')));
	const createOption = $derived((theme: BenchmarkEChartTheme): BenchmarkEChartOption => {
		const baseOption = getBenchmarkEChartBaseOption(theme);
		return {
			...baseOption,
			color: series.map((_, index) => getBenchmarkEChartSeriesColor(theme, index)),
			...getBenchmarkEChartZoomablePlotOption(theme, { hasLegend, left: 68 }),
			series: series.map(({ label, data }) => ({
				areaStyle: { opacity: 0.08 },
				data: data.map(({ frametime, percentage }) => [frametime, percentage]),
				emphasis: { focus: 'series' },
				lineStyle: { width: 2 },
				name: label,
				showSymbol: false,
				type: 'line'
			})),
			tooltip: {
				...baseOption.tooltip,
				...getBenchmarkEChartPlotTooltip(theme),
				valueFormatter: (value: EChartValue) =>
					typeof value === 'number' ? formatMetricValue(value, '%') : String(value)
			},
			xAxis: {
				...getBenchmarkEChartPlotXAxis(theme, (value: number) => formatMetricValue(value)),
				min: 0,
				name: 'Frametime (ms)',
				nameGap: 28,
				nameLocation: 'middle',
				type: 'value'
			},
			yAxis: {
				...getBenchmarkEChartAxis(theme, (value: number) => formatMetricValue(value, '%')),
				min: 0,
				name: 'Captured time',
				nameGap: 50,
				nameLocation: 'middle',
				nameRotate: 90,
				type: 'value'
			}
		};
	});
</script>

{#if hasData}
	<BenchmarkChartCard
		title="Frame time distribution"
		description={`Captured time in each ${FRAMETIME_DISTRIBUTION_BIN_SIZE} ms frametime band. Narrower peaks indicate more consistent frame pacing.`}
		chartClass="h-80"
		ariaLabel="Frame time distribution chart"
		{createOption}
		dragZoom
	/>
{/if}
