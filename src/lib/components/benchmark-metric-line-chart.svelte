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
		buildSharedMetricChartData,
		formatBenchmarkMetricName,
		formatMetricValue,
		getBenchmarkMetricUnit,
		hasNonZeroMetricValues,
		type BenchmarkChartRun
	} from '$lib/benchmark-chart';
	import BenchmarkChartCard from '$lib/components/benchmark-chart-card.svelte';
	import {
		getBenchmarkEChartAxis,
		getBenchmarkEChartBaseOption,
		getBenchmarkEChartLegend,
		getBenchmarkEChartSeriesColor,
		type BenchmarkEChartOption,
		type BenchmarkEChartTheme
	} from '$lib/benchmark-echart';

	interface Props {
		runs: BenchmarkChartRun[];
		metricKey: string;
		description?: string;
	}

	let { runs, metricKey, description }: Props = $props();

	const unit = $derived(getBenchmarkMetricUnit(metricKey));
	const title = $derived(formatBenchmarkMetricName(metricKey));
	const metricSeries = $derived.by(() =>
		runs.flatMap((run) => {
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
					points
				}
			];
		})
	);
	const hasLegend = $derived(metricSeries.length > 1);
	const chartData = $derived(buildSharedMetricChartData(metricSeries));
	const createOption = $derived((theme: BenchmarkEChartTheme): BenchmarkEChartOption => {
		const baseOption = getBenchmarkEChartBaseOption(theme);
		return {
			...baseOption,
			color: metricSeries.map((_, index) => getBenchmarkEChartSeriesColor(theme, index)),
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
					dataBackground: {
						areaStyle: { color: theme.border, opacity: 0.25 },
						lineStyle: { color: theme.mutedForeground, opacity: 0.55 }
					},
					fillerColor: theme.border,
					handleStyle: {
						borderColor: theme.mutedForeground,
						color: theme.background
					},
					height: 16,
					moveHandleStyle: { color: theme.mutedForeground },
					selectedDataBackground: {
						areaStyle: { color: theme.mutedForeground, opacity: 0.2 },
						lineStyle: { color: theme.mutedForeground }
					},
					showDetail: false,
					type: 'slider',
					xAxisIndex: 0
				}
			],
			grid: {
				bottom: hasLegend ? 88 : 64,
				left: 60,
				right: 16,
				top: 12
			},
			legend: {
				...getBenchmarkEChartLegend(theme),
				bottom: 0,
				show: hasLegend,
				type: 'scroll'
			},
			toolbox: {
				feature: {
					dataZoom: {
						brushStyle: {
							borderColor: theme.mutedForeground,
							borderWidth: 1,
							color: theme.border
						},
						xAxisIndex: 0,
						yAxisIndex: false
					}
				},
				itemSize: 0,
				show: true,
				showTitle: false
			},
			series: metricSeries.map(({ key, label }) => ({
				data: chartData.map((row) => [row.timeSeconds, row[key]]),
				emphasis: { focus: 'series' },
				lineStyle: { width: 1.75 },
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
				formatter: (params: unknown) => formatLineTooltip(params, unit),
				trigger: 'axis'
			},
			xAxis: {
				...getBenchmarkEChartAxis(theme, (value: number) => formatMetricValue(value)),
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
