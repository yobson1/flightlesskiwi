<script lang="ts">
	import { ChartNoAxesCombined } from '@lucide/svelte';
	import { hasNonZeroMetricValues, type BenchmarkChartRun } from '$lib/benchmark-chart';
	import BenchmarkFpsSummaryChart from '$lib/components/benchmark-fps-summary-chart.svelte';
	import BenchmarkMetricAverageChart from '$lib/components/benchmark-metric-average-chart.svelte';
	import BenchmarkMetricLineChart from '$lib/components/benchmark-metric-line-chart.svelte';
	import * as Tabs from '$lib/components/ui/tabs';

	interface Props {
		runs: BenchmarkChartRun[];
	}

	let { runs }: Props = $props();

	const metricKeys = $derived.by(() => {
		const keys = new Set<string>();
		for (const run of runs) {
			for (const metric of run.mangoHudData?.metrics ?? []) {
				if (hasNonZeroMetricValues(metric.values)) keys.add(metric.key);
			}
		}
		return [...keys];
	});
	const hasFps = $derived(metricKeys.includes('fps'));
	const hasFrametime = $derived(metricKeys.includes('frametime'));
</script>

<section class="mt-8" aria-labelledby="benchmark-charts-heading">
	<div class="mb-4 flex items-center gap-2">
		<ChartNoAxesCombined class="size-5 text-primary" />
		<h2 id="benchmark-charts-heading" class="text-xl font-semibold">Benchmark charts</h2>
	</div>

	{#if metricKeys.length === 0}
		<div class="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
			No MangoHud performance data could be read from the included files.
		</div>
	{:else}
		<Tabs.Root value="performance">
			<Tabs.List variant="line">
				<Tabs.Trigger value="performance">Performance</Tabs.Trigger>
				<Tabs.Trigger value="summary">Summary</Tabs.Trigger>
				<Tabs.Trigger value="all-data">All data</Tabs.Trigger>
			</Tabs.List>

			<Tabs.Content value="performance" class="mt-4 space-y-4">
				{#if hasFps}
					<BenchmarkFpsSummaryChart {runs} />
				{/if}
				{#if hasFrametime}
					<BenchmarkMetricLineChart
						{runs}
						metricKey="frametime"
						description="Frame pacing throughout each run. Lower and more consistent is better."
					/>
				{/if}
			</Tabs.Content>

			<Tabs.Content value="summary" class="mt-4 grid gap-4 lg:grid-cols-2">
				{#each metricKeys as metricKey (metricKey)}
					<BenchmarkMetricAverageChart {runs} {metricKey} />
				{/each}
			</Tabs.Content>

			<Tabs.Content value="all-data" class="mt-4 space-y-4">
				{#each metricKeys as metricKey (metricKey)}
					<BenchmarkMetricLineChart {runs} {metricKey} />
				{/each}
			</Tabs.Content>
		</Tabs.Root>
	{/if}
</section>
