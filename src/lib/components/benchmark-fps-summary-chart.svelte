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
		{ key: 'low', label: '1st percentile', value: 'low', colorIndex: 2 },
		{ key: 'average', label: 'Average', value: 'average', colorIndex: 0 },
		{ key: 'high', label: '97th percentile', value: 'high', colorIndex: 1 }
	];
</script>

<BenchmarkHorizontalBarChart
	title="FPS comparison"
	description="Low, average, and high frame rates for each run."
	data={chartData}
	{series}
	unit="FPS"
	chartClass="h-80"
	leftPadding={168}
	rightPadding={72}
	maxLabelCharacters={24}
	showLegend
/>
