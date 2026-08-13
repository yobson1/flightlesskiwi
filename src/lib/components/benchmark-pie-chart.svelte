<script lang="ts">
	import { formatMetricValue } from '$lib/benchmark-chart';
	import type { DefaultLabelFormatterCallbackParams } from 'echarts';
	import BenchmarkChartCard from '$lib/components/benchmark-chart-card.svelte';
	import {
		getBenchmarkEChartBaseOption,
		getBenchmarkEChartLegend,
		type BenchmarkEChartOption,
		type BenchmarkEChartTheme
	} from '$lib/benchmark-echart';

	type EChartValue = DefaultLabelFormatterCallbackParams['value'];

	export interface BenchmarkPieChartDatum {
		label: string;
		percentage: number;
		color: string;
	}

	interface Props {
		title: string;
		description: string;
		data: BenchmarkPieChartDatum[];
	}

	let { title, description, data }: Props = $props();

	const createOption = $derived((theme: BenchmarkEChartTheme): BenchmarkEChartOption => {
		const baseOption = getBenchmarkEChartBaseOption(theme);
		return {
			...baseOption,
			legend: {
				...getBenchmarkEChartLegend(theme),
				bottom: 0,
				formatter: (label: string) => {
					const percentage = data.find((datum) => datum.label === label)?.percentage;
					return percentage === undefined
						? label
						: `${label}  ${formatMetricValue(percentage, '%')}`;
				},
				type: 'scroll'
			},
			series: [
				{
					avoidLabelOverlap: true,
					data: data.map(({ label, percentage, color }) => ({
						itemStyle: { color },
						name: label,
						value: percentage
					})),
					emphasis: {
						label: {
							color: theme.foreground,
							fontSize: 16,
							fontWeight: 600,
							formatter: ({ name, percent }: { name?: string; percent?: number }) =>
								`${name ?? ''}\n${formatMetricValue(percent ?? 0, '%')}`,
							show: true
						},
						scaleSize: 6
					},
					itemStyle: {
						borderColor: theme.background,
						borderRadius: 3,
						borderWidth: 2
					},
					label: { show: false },
					labelLine: { show: false },
					name: title,
					radius: ['42%', '72%'],
					center: ['50%', '42%'],
					type: 'pie'
				}
			],
			tooltip: {
				...baseOption.tooltip,
				trigger: 'item',
				valueFormatter: (value: EChartValue) =>
					typeof value === 'number' ? formatMetricValue(value, '%') : String(value)
			}
		};
	});
</script>

<BenchmarkChartCard
	{title}
	{description}
	chartClass="h-72"
	ariaLabel={`${title} pie chart`}
	{createOption}
/>
