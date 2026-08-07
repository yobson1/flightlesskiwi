import { BarChart, LineChart, PieChart } from 'echarts/charts';
import {
	AriaComponent,
	DataZoomComponent,
	GridComponent,
	LegendComponent,
	ToolboxComponent,
	TooltipComponent
} from 'echarts/components';
import { init, use, type EChartsCoreOption, type EChartsType } from 'echarts/core';
import { LabelLayout } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';

use([
	AriaComponent,
	BarChart,
	CanvasRenderer,
	DataZoomComponent,
	GridComponent,
	LabelLayout,
	LegendComponent,
	LineChart,
	PieChart,
	ToolboxComponent,
	TooltipComponent
]);

export interface BenchmarkEChartTheme {
	background: string;
	border: string;
	colors: string[];
	foreground: string;
	mutedForeground: string;
}

export type BenchmarkEChartOption = EChartsCoreOption;
export type BenchmarkEChartInstance = EChartsType;

let cachedThemeSignature = '';
let cachedTheme: BenchmarkEChartTheme | undefined;

export function createBenchmarkEChart(element: HTMLDivElement): BenchmarkEChartInstance {
	return init(element, undefined, { renderer: 'canvas' });
}

export function getBenchmarkEChartBaseOption(theme: BenchmarkEChartTheme) {
	return {
		animation: false,
		aria: { enabled: true },
		tooltip: {
			appendToBody: true,
			backgroundColor: theme.background,
			borderColor: theme.border,
			confine: true,
			textStyle: { color: theme.foreground }
		}
	};
}

export function getBenchmarkEChartAxis<Value>(
	theme: BenchmarkEChartTheme,
	formatter?: (value: Value) => string
) {
	return {
		axisLabel: {
			color: theme.mutedForeground,
			...(formatter ? { formatter } : {})
		},
		axisLine: { show: false },
		axisTick: { show: false },
		nameTextStyle: { color: theme.mutedForeground },
		splitLine: { lineStyle: { color: theme.border } }
	};
}

export function getBenchmarkEChartPlotXAxis<Value>(
	theme: BenchmarkEChartTheme,
	formatter?: (value: Value) => string
) {
	return {
		...getBenchmarkEChartAxis(theme, formatter),
		boundaryGap: [0, 0],
		max: 'dataMax'
	};
}

export function getBenchmarkEChartLegend(theme: BenchmarkEChartTheme) {
	return {
		icon: 'roundRect',
		itemHeight: 10,
		itemWidth: 10,
		textStyle: { color: theme.mutedForeground }
	};
}

export function getBenchmarkEChartPlotTooltip(theme: BenchmarkEChartTheme) {
	return {
		axisPointer: {
			lineStyle: { color: theme.mutedForeground },
			snap: true,
			type: 'line'
		},
		trigger: 'axis'
	};
}

export function getBenchmarkEChartZoomablePlotOption(
	theme: BenchmarkEChartTheme,
	options: { hasLegend: boolean; left: number }
) {
	const { hasLegend, left } = options;
	return {
		dataZoom: [
			{
				filterMode: 'filter',
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
				filterMode: 'filter',
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
			left,
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
		}
	};
}

export function getBenchmarkEChartSeriesColor(theme: BenchmarkEChartTheme, index: number): string {
	return theme.colors[index % theme.colors.length] ?? theme.foreground;
}

export function readBenchmarkEChartTheme(): BenchmarkEChartTheme {
	const styles = getComputedStyle(document.documentElement);
	const variable = (name: string) => styles.getPropertyValue(name).trim();
	const signature = [
		'--popover',
		'--border',
		'--foreground',
		'--muted-foreground',
		...Array.from({ length: 5 }, (_, index) => `--chart-${index + 1}`)
	]
		.map(variable)
		.join('|');
	if (cachedTheme && cachedThemeSignature === signature) return cachedTheme;

	const color = (name: string) => resolveCanvasColor(variable(name));
	const baseColors = Array.from({ length: 5 }, (_, index) => color(`--chart-${index + 1}`));
	const mixedColors = [
		mixCanvasColors(baseColors[0]!, baseColors[3]!, 45),
		mixCanvasColors(baseColors[1]!, baseColors[4]!, 45),
		mixCanvasColors(baseColors[2]!, baseColors[3]!, 45)
	];

	cachedThemeSignature = signature;
	cachedTheme = {
		background: color('--popover'),
		border: color('--border'),
		colors: [...baseColors, ...mixedColors],
		foreground: color('--foreground'),
		mutedForeground: color('--muted-foreground')
	};
	return cachedTheme;
}

function mixCanvasColors(first: string, second: string, secondPercentage: number): string {
	return resolveCanvasColor(`color-mix(in oklch, ${first}, ${second} ${secondPercentage}%)`);
}

function resolveCanvasColor(value: string): string {
	const canvas = document.createElement('canvas');
	canvas.width = 1;
	canvas.height = 1;
	const context = canvas.getContext('2d', { willReadFrequently: true });
	if (!context) return value;

	context.clearRect(0, 0, 1, 1);
	context.fillStyle = value;
	context.fillRect(0, 0, 1, 1);
	const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
	return `rgba(${red}, ${green}, ${blue}, ${(alpha ?? 255) / 255})`;
}
