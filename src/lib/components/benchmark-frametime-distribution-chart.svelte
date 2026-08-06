<script lang="ts">
	import {
		calculateFrametimeDistribution,
		FRAMETIME_DISTRIBUTION_BIN_SIZE,
		formatMetricValue,
		hasNonZeroMetricValues,
		stripFileExtension,
		type BenchmarkChartRun
	} from '$lib/benchmark-chart';
	import BenchmarkChartCard from '$lib/components/benchmark-chart-card.svelte';
	import {
		getBenchmarkEChartAxis,
		getBenchmarkEChartBaseOption,
		getBenchmarkEChartLegend,
		getBenchmarkEChartPlotXAxis,
		getBenchmarkEChartSeriesColor,
		type BenchmarkEChartOption,
		type BenchmarkEChartTheme
	} from '$lib/benchmark-echart';

	interface Props {
		runs: BenchmarkChartRun[];
	}

	let { runs }: Props = $props();

	const series = $derived.by(() =>
		runs.flatMap((run) => {
			const frametime = run.benchmarkRun?.data.metrics.find(({ key }) => key === 'frametime');
			if (!frametime || !hasNonZeroMetricValues(frametime.values)) return [];

			const data = calculateFrametimeDistribution(frametime.values);
			return data.length === 0 ? [] : [{ label: stripFileExtension(run.originalName), data }];
		})
	);
	const hasLegend = $derived(series.length > 1);
	const hasData = $derived(
		runs.some((run) => {
			const frametime = run.benchmarkRun?.data.metrics.find(({ key }) => key === 'frametime');
			return frametime && hasNonZeroMetricValues(frametime.values);
		})
	);
	const createOption = $derived((theme: BenchmarkEChartTheme): BenchmarkEChartOption => {
		const baseOption = getBenchmarkEChartBaseOption(theme);
		return {
			...baseOption,
			color: series.map((_, index) => getBenchmarkEChartSeriesColor(theme, index)),
			dataZoom: [
				{
					filterMode: 'none',
					moveOnMouseMove: true,
					moveOnMouseWheel: false,
					type: 'inside',
					xAxisIndex: 0,
					zoomOnMouseWheel: true
				},
				{
					borderColor: theme.border,
					bottom: hasLegend ? 28 : 4,
					fillerColor: theme.border,
					handleStyle: {
						borderColor: theme.mutedForeground,
						color: theme.background
					},
					height: 16,
					moveHandleStyle: { color: theme.mutedForeground },
					showDetail: false,
					type: 'slider',
					xAxisIndex: 0
				}
			],
			grid: {
				bottom: hasLegend ? 88 : 64,
				left: 68,
				right: 16,
				top: 12
			},
			legend: {
				...getBenchmarkEChartLegend(theme),
				bottom: 0,
				show: hasLegend,
				type: 'scroll'
			},
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
				axisPointer: {
					lineStyle: { color: theme.mutedForeground },
					snap: true,
					type: 'line'
				},
				trigger: 'axis',
				valueFormatter: (value: unknown) =>
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
