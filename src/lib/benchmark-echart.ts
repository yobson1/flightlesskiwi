import { BarChart, LineChart } from 'echarts/charts';
import {
	AriaComponent,
	DataZoomComponent,
	GridComponent,
	LegendComponent,
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

export function getBenchmarkEChartLegend(theme: BenchmarkEChartTheme) {
	return {
		icon: 'roundRect',
		itemHeight: 10,
		itemWidth: 10,
		textStyle: { color: theme.mutedForeground }
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
