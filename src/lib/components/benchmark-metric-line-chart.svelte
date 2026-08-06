<script lang="ts" module>
	interface LineTooltipItem {
		axisValue?: unknown;
		marker?: string;
		seriesName?: string;
		value?: unknown;
	}

	function formatLineTooltip(params: unknown, unit: string): string {
		const items = (Array.isArray(params) ? params : [params]).filter(
			(item): item is LineTooltipItem => typeof item === 'object' && item !== null
		);
		const itemsWithValues = items.flatMap((item) => {
			const value = Array.isArray(item.value) ? item.value[1] : item.value;
			return typeof value === 'number' && Number.isFinite(value) ? [{ item, value }] : [];
		});
		const firstItem = itemsWithValues[0]?.item;
		const time =
			typeof firstItem?.axisValue === 'number'
				? `${formatMetricValue(firstItem.axisValue)} seconds`
				: String(firstItem?.axisValue ?? '');
		const rows = itemsWithValues
			.map(({ item, value }) => {
				return `${item.marker ?? ''}<span style="min-width:0;overflow:hidden;text-align:left;text-overflow:ellipsis">${escapeHtml(item.seriesName ?? '')}</span><strong style="font-family:monospace;text-align:right">${escapeHtml(formatMetricValue(value, unit))}</strong>`;
			})
			.join('');

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
		formatMetricValue,
		getBenchmarkRunMetric,
		stripFileExtension,
		type BenchmarkChartRun
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
		return {
			...baseOption,
			color: plotSeries.map(({ colorIndex }) => getBenchmarkEChartSeriesColor(theme, colorIndex)),
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
				formatter: (params: unknown) => formatLineTooltip(params, unit)
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
