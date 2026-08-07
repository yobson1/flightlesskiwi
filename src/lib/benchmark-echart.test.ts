import { describe, expect, test } from 'bun:test';
import {
	getBenchmarkEChartZoomablePlotOption,
	type BenchmarkEChartTheme
} from './benchmark-echart';

const theme: BenchmarkEChartTheme = {
	background: '#000',
	border: '#222',
	colors: ['#fff'],
	foreground: '#fff',
	mutedForeground: '#aaa'
};

describe('benchmark EChart options', () => {
	test('filters data outside the zoomed region so other axes rescale', () => {
		const option = getBenchmarkEChartZoomablePlotOption(theme, {
			hasLegend: false,
			left: 60
		});

		expect(option.dataZoom.map(({ filterMode }) => filterMode)).toEqual(['filter', 'filter']);
	});
});
