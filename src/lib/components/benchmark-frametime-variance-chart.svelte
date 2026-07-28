<script lang="ts">
	import {
		calculateFrametimeVariance,
		stripFileExtension,
		type BenchmarkChartRun
	} from '$lib/benchmark-chart';
	import BenchmarkPieChart from '$lib/components/benchmark-pie-chart.svelte';

	interface Props {
		run: BenchmarkChartRun;
	}

	let { run }: Props = $props();

	const frametime = $derived(run.benchmarkRun?.data.metrics.find(({ key }) => key === 'frametime'));
	const variance = $derived(frametime ? calculateFrametimeVariance(frametime.values) : []);
	const colors = ['#2297f3', '#0f78b4', '#fbbf24', '#f17d20', '#dc2626'];
	const data = $derived(
		variance.map(({ label, percentage }, index) => ({
			label,
			percentage,
			color: colors[index]!
		}))
	);
</script>

{#if data.length > 0}
	<BenchmarkPieChart
		title={`Frame-to-frame variance · ${stripFileExtension(run.originalName)}`}
		description="Absolute time difference between consecutive frames. Smaller differences indicate steadier pacing."
		{data}
	/>
{/if}
