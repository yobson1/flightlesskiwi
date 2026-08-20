<script lang="ts">
	import {
		calculateFrametimeStability,
		getBenchmarkChartColorIndex,
		getBenchmarkRunMetric,
		stripFileExtension,
		type BenchmarkChartRun
	} from '#lib/benchmark-chart.js';
	import BenchmarkHorizontalBarChart from '#lib/components/benchmark-horizontal-bar-chart.svelte';

	interface Props {
		benchmarkId: string;
		runs: BenchmarkChartRun[];
	}

	let { benchmarkId, runs }: Props = $props();

	const chartData = $derived.by(() =>
		runs.flatMap((run) => {
			const frametime = getBenchmarkRunMetric(run, 'frametime');
			if (!frametime) return [];

			const stability = calculateFrametimeStability(frametime.values);
			return stability === null
				? []
				: [{ run: stripFileExtension(run.originalName), ...stability }];
		})
	);
	const series = $derived([
		{
			label: 'Standard deviation ÷ mean',
			value: 'standardDeviation',
			colorIndex: getBenchmarkChartColorIndex(
				benchmarkId,
				'performance:frametime-standard-deviation'
			)
		},
		{
			label: 'P99 overhead above median',
			value: 'p99Overhead',
			colorIndex: getBenchmarkChartColorIndex(benchmarkId, 'performance:frametime-p99-overhead')
		}
	]);
</script>

<BenchmarkHorizontalBarChart
	title="Frametime Stability"
	description="Overall jitter and near-worst recurring frametime above the median. Lower percentages are better."
	data={chartData}
	{series}
	unit="%"
	chartClass="h-80"
	rightPadding={72}
	showLegend
/>
