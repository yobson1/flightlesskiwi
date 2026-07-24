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
		const firstItem = items[0];
		const time =
			typeof firstItem?.axisValue === 'number'
				? `${formatMetricValue(firstItem.axisValue)} seconds`
				: String(firstItem?.axisValue ?? '');
		const rows = items
			.map((item) => {
				const value = Array.isArray(item.value) ? item.value[1] : item.value;
				return `<div style="display:flex;align-items:center;justify-content:space-between;gap:1rem">${item.marker ?? ''}<span style="min-width:0;overflow:hidden;text-overflow:ellipsis">${escapeHtml(item.seriesName ?? '')}</span><strong style="font-family:monospace">${typeof value === 'number' ? escapeHtml(formatMetricValue(value, unit)) : escapeHtml(String(value ?? ''))}</strong></div>`;
			})
			.join('');

		return `<div style="font-weight:500;margin-bottom:.375rem">${escapeHtml(time)}</div><div style="display:grid;gap:.25rem">${rows}</div>`;
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
	import BenchmarkEChart from '$lib/components/benchmark-echart.svelte';
	import type { BenchmarkEChartOption, BenchmarkEChartTheme } from '$lib/benchmark-echart';

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
	const createOption = $derived((theme: BenchmarkEChartTheme): BenchmarkEChartOption => ({
		animation: false,
		aria: { enabled: true },
		color: metricSeries.map(
			(_, index) => theme.colors[index % theme.colors.length] ?? theme.foreground
		),
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
			bottom: 0,
			icon: 'roundRect',
			itemHeight: 10,
			itemWidth: 10,
			show: hasLegend,
			textStyle: { color: theme.mutedForeground },
			type: 'scroll'
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
			appendToBody: true,
			axisPointer: {
				lineStyle: { color: theme.mutedForeground },
				snap: true,
				type: 'line'
			},
			backgroundColor: theme.background,
			borderColor: theme.border,
			confine: true,
			formatter: (params: unknown) => formatLineTooltip(params, unit),
			textStyle: { color: theme.foreground },
			trigger: 'axis'
		},
		xAxis: {
			axisLabel: {
				color: theme.mutedForeground,
				formatter: (value: number) => formatMetricValue(value)
			},
			axisLine: { show: false },
			axisTick: { show: false },
			name: 'Time (seconds)',
			nameGap: 28,
			nameLocation: 'middle',
			nameTextStyle: { color: theme.mutedForeground },
			splitLine: { lineStyle: { color: theme.border } },
			type: 'value'
		},
		yAxis: {
			axisLabel: { color: theme.mutedForeground },
			axisLine: { show: false },
			axisTick: { show: false },
			name: unit || title,
			nameGap: 42,
			nameLocation: 'middle',
			nameRotate: 90,
			nameTextStyle: { color: theme.mutedForeground },
			splitLine: { lineStyle: { color: theme.border } },
			type: 'value'
		}
	}));
</script>

<BenchmarkChartCard
	{title}
	description={description ?? `${title} throughout each benchmark run${unit ? ` (${unit})` : ''}.`}
	chartClass="h-72"
>
	<BenchmarkEChart ariaLabel={`${title} over time chart`} class="h-full" {createOption} />
</BenchmarkChartCard>
