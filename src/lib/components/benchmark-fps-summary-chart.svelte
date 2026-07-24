<script lang="ts">
	import {
		averageMetricValues,
		hasNonZeroMetricValues,
		percentileMetricValue,
		type BenchmarkChartRun
	} from '$lib/benchmark-chart';
	import BenchmarkHorizontalBarChart from '$lib/components/benchmark-horizontal-bar-chart.svelte';

	interface Props {
		runs: BenchmarkChartRun[];
	}

	let { runs }: Props = $props();

	const chartData = $derived.by(() =>
		runs.flatMap((run) => {
			const fps = run.mangoHudData?.metrics.find(({ key }) => key === 'fps');
			if (!fps || !hasNonZeroMetricValues(fps.values)) return [];

			const low = percentileMetricValue(fps.values, 0.01);
			const average = averageMetricValues(fps.values);
			const high = percentileMetricValue(fps.values, 0.97);
			return low === null || average === null || high === null
				? []
				: [{ run: run.originalName, low, average, high }];
		})
	);
	const series = [
		{ key: 'low', label: '1st percentile', value: 'low', color: 'var(--chart-3)' },
		{ key: 'average', label: 'Average', value: 'average', color: 'var(--chart-1)' },
		{ key: 'high', label: '97th percentile', value: 'high', color: 'var(--chart-2)' }
	];
	const config = {
		low: { label: '1st percentile', color: 'var(--chart-3)' },
		average: { label: 'Average', color: 'var(--chart-1)' },
		high: { label: '97th percentile', color: 'var(--chart-2)' }
	};
</script>

<BenchmarkHorizontalBarChart
	title="FPS comparison"
	description="Low, average, and high frame rates for each run."
	data={chartData}
	{series}
	{config}
	unit="FPS"
	chartClass="h-80"
	leftPadding={168}
	rightPadding={72}
	maxLabelCharacters={24}
	showLegend
/>
