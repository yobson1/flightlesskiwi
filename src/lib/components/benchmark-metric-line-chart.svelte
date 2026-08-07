<script lang="ts" module>
	interface LineTooltipItem {
		axisValue?: unknown;
		value?: unknown;
	}

	interface LineTooltipSeries {
		color: string;
		label: string;
		points: readonly MetricChartPoint[];
	}

	function formatLineTooltip(
		params: unknown,
		unit: string,
		series: readonly LineTooltipSeries[]
	): string {
		const items = (Array.isArray(params) ? params : [params]).filter(
			(item): item is LineTooltipItem => typeof item === 'object' && item !== null
		);
		const axisValue = items.find((item) => typeof item.axisValue === 'number')?.axisValue;
		const valueItem = items.find(
			(item) => Array.isArray(item.value) && typeof item.value[0] === 'number'
		);
		const timeSeconds =
			typeof axisValue === 'number'
				? axisValue
				: Array.isArray(valueItem?.value)
					? valueItem.value[0]
					: undefined;
		if (typeof timeSeconds !== 'number') return '';

		const rows = series
			.flatMap(({ color, label, points }) => {
				const point = findMetricChartPointAtOrBefore(points, timeSeconds);
				return point ? [{ color, label, value: point.value }] : [];
			})
			.map(({ color, label, value }) => {
				const marker = `<span style="background-color:${escapeHtml(color)};border-radius:50%;display:inline-block;height:10px;margin-right:4px;width:10px"></span>`;
				return `${marker}<span style="min-width:0;overflow:hidden;text-align:left;text-overflow:ellipsis">${escapeHtml(label)}</span><strong style="font-family:monospace;text-align:right">${escapeHtml(formatMetricValue(value, unit))}</strong>`;
			})
			.join('');
		const time = `${formatMetricValue(timeSeconds)} seconds`;

		return `<div style="font-weight:500;margin-bottom:.375rem">${escapeHtml(time)}</div><div style="display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;column-gap:.5rem;row-gap:.25rem">${rows}</div>`;
	}

	function escapeHtml(value: string): string {
		return value
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;')
			.replaceAll('"', '&quot;')
			.replaceAll("'", '&#039;');
	}
</script>

<script lang="ts">
	import {
		buildMetricChartPoints,
		calculateFrametimeMovingAverage,
		findMetricChartPointAtOrBefore,
		formatMetricValue,
		getBenchmarkRunMetric,
		stripFileExtension,
		type BenchmarkChartRun,
		type MetricChartPoint
	} from '$lib/benchmark-chart';
	import type { BenchmarkMetric } from '$lib/benchmark-run';
	import BenchmarkChartCard from '$lib/components/benchmark-chart-card.svelte';
	import {
		getBenchmarkEChartAxis,
		getBenchmarkEChartBaseOption,
		getBenchmarkEChartPlotTooltip,
		getBenchmarkEChartPlotXAxis,
		getBenchmarkEChartSeriesColor,
		getBenchmarkEChartZoomablePlotOption,
		type BenchmarkEChartOption,
		type BenchmarkEChartTheme
	} from '$lib/benchmark-echart';

	interface Props {
		runs: BenchmarkChartRun[];
		metric: BenchmarkMetric;
		description?: string;
		showMovingAverage?: boolean;
	}

	let { runs, metric, description, showMovingAverage = false }: Props = $props();

	const unit = $derived(metric.unit);
	const title = $derived(metric.prettyName);
	const metricSeries = $derived.by(() =>
		runs.flatMap((run) => {
			const runMetric = getBenchmarkRunMetric(run, metric.key);
			if (!runMetric) return [];

			const points = buildMetricChartPoints(runMetric.timeSeconds, runMetric.values);
			if (points.length === 0) return [];

			const movingAveragePoints =
				metric.key === 'frametime' && showMovingAverage
					? buildMetricChartPoints(
							runMetric.timeSeconds,
							calculateFrametimeMovingAverage(runMetric.values)
						)
					: [];

			return [
				{
					label: stripFileExtension(run.originalName),
					movingAveragePoints,
					points
				}
			];
		})
	);
	const plotSeries = $derived(
		metricSeries.flatMap(({ label, movingAveragePoints, points }, colorIndex) => [
			{ label, points, colorIndex, movingAverage: false },
			...(movingAveragePoints.length > 0
				? [
						{
							label: `${label} · moving average`,
							points: movingAveragePoints,
							colorIndex,
							movingAverage: true
						}
					]
				: [])
		])
	);
	const hasLegend = $derived(plotSeries.length > 1);
	const createOption = $derived((theme: BenchmarkEChartTheme): BenchmarkEChartOption => {
		const baseOption = getBenchmarkEChartBaseOption(theme);
		const seriesColors = plotSeries.map(({ colorIndex }) =>
			getBenchmarkEChartSeriesColor(theme, colorIndex)
		);
		const tooltipSeries = plotSeries.map(({ label, points }, index) => ({
			color: seriesColors[index]!,
			label,
			points
		}));
		return {
			...baseOption,
			color: seriesColors,
			...getBenchmarkEChartZoomablePlotOption(theme, { hasLegend, left: 60 }),
			series: plotSeries.map(({ label, movingAverage, points }) => ({
				data: points.map(({ timeSeconds, value }) => [timeSeconds, value]),
				emphasis: { focus: 'series' },
				lineStyle: {
					opacity: movingAverage ? 1 : showMovingAverage ? 0.55 : 1,
					width: movingAverage ? 3 : 1.75
				},
				name: label,
				showSymbol: false,
				type: 'line'
			})),
			tooltip: {
				...baseOption.tooltip,
				...getBenchmarkEChartPlotTooltip(theme),
				formatter: (params: unknown) => formatLineTooltip(params, unit, tooltipSeries)
			},
			xAxis: {
				...getBenchmarkEChartPlotXAxis(theme, (value: number) => formatMetricValue(value)),
				min: 0,
				name: 'Time (seconds)',
				nameGap: 28,
				nameLocation: 'middle',
				type: 'value'
			},
			yAxis: {
				...getBenchmarkEChartAxis(theme),
				name: unit || title,
				nameGap: 42,
				nameLocation: 'middle',
				nameRotate: 90,
				scale: true,
				type: 'value'
			}
		};
	});
</script>

<BenchmarkChartCard
	{title}
	description={description ?? `${title} throughout each benchmark run${unit ? ` (${unit})` : ''}.`}
	chartClass="h-72"
	ariaLabel={`${title} over time chart`}
	{createOption}
	dragZoom
/>
