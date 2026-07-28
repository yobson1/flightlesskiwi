<script lang="ts">
	import {
		calculateFrametimeClassification,
		LOW_FPS_THRESHOLD,
		STUTTER_FACTOR,
		stripFileExtension,
		type BenchmarkChartRun
	} from '$lib/benchmark-chart';
	import BenchmarkPieChart from '$lib/components/benchmark-pie-chart.svelte';

	interface Props {
		run: BenchmarkChartRun;
	}

	let { run }: Props = $props();

	const frametime = $derived(run.benchmarkRun?.data.metrics.find(({ key }) => key === 'frametime'));
	const classification = $derived(
		frametime ? calculateFrametimeClassification(frametime.values) : []
	);
	const data = $derived(
		classification.map(({ label, percentage }) => ({
			label,
			percentage,
			color: label === 'Smooth' ? '#22c55e' : label === 'Low FPS' ? '#f59e0b' : '#ef4444'
		}))
	);
</script>

{#if data.length > 0}
	<BenchmarkPieChart
		title={`Frame classification · ${stripFileExtension(run.originalName)}`}
		description={`Share of captured time that was smooth, below ${LOW_FPS_THRESHOLD} FPS, or a stutter above ${STUTTER_FACTOR}× the moving average.`}
		{data}
	/>
{/if}
