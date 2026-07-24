<script lang="ts">
	import { ChartNoAxesCombined } from '@lucide/svelte';
	import { hasNonZeroMetricValues, type BenchmarkChartRun } from '$lib/benchmark-chart';
	import BenchmarkFpsSummaryChart from '$lib/components/benchmark-fps-summary-chart.svelte';
	import BenchmarkLazyChart from '$lib/components/benchmark-lazy-chart.svelte';
	import BenchmarkMetricAverageChart from '$lib/components/benchmark-metric-average-chart.svelte';
	import BenchmarkMetricLineChart from '$lib/components/benchmark-metric-line-chart.svelte';
	import * as Tabs from '$lib/components/ui/tabs';

	interface Props {
		runs: BenchmarkChartRun[];
	}

	let { runs }: Props = $props();
	let selectedTab = $state('performance');
	let visitedTabs = $state(new Set(['performance']));

	const metricKeys = $derived.by(() => {
		const keys: string[] = [];
		for (const run of runs) {
			for (const metric of run.mangoHudData?.metrics ?? []) {
				if (hasNonZeroMetricValues(metric.values) && !keys.includes(metric.key)) {
					keys.push(metric.key);
				}
			}
		}
		return keys;
	});
	const hasFps = $derived(metricKeys.includes('fps'));
	const hasFrametime = $derived(metricKeys.includes('frametime'));

	$effect(() => {
		if (!visitedTabs.has(selectedTab)) {
			visitedTabs = new Set([...visitedTabs, selectedTab]);
		}
	});
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
		<Tabs.Root bind:value={selectedTab}>
			<Tabs.List variant="line">
				<Tabs.Trigger value="performance">Performance</Tabs.Trigger>
				<Tabs.Trigger value="summary">Summary</Tabs.Trigger>
				<Tabs.Trigger value="all-data">All data</Tabs.Trigger>
			</Tabs.List>

			<Tabs.Content value="performance" class="mt-4 space-y-4">
				{#if visitedTabs.has('performance')}
					{#if hasFps}
						<BenchmarkLazyChart>
							<BenchmarkFpsSummaryChart {runs} />
						</BenchmarkLazyChart>
					{/if}
					{#if hasFrametime}
						<BenchmarkLazyChart class="min-h-88">
							<BenchmarkMetricLineChart
								{runs}
								metricKey="frametime"
								description="Frame pacing throughout each run. Lower and more consistent is better."
							/>
						</BenchmarkLazyChart>
					{/if}
				{/if}
			</Tabs.Content>

			<Tabs.Content value="summary" class="mt-4 grid gap-4 lg:grid-cols-2">
				{#if visitedTabs.has('summary')}
					{#each metricKeys as metricKey (metricKey)}
						<BenchmarkLazyChart>
							<BenchmarkMetricAverageChart {runs} {metricKey} />
						</BenchmarkLazyChart>
					{/each}
				{/if}
			</Tabs.Content>

			<Tabs.Content value="all-data" class="mt-4 space-y-4">
				{#if visitedTabs.has('all-data')}
					{#each metricKeys as metricKey (metricKey)}
						<BenchmarkLazyChart class="min-h-88">
							<BenchmarkMetricLineChart {runs} {metricKey} />
						</BenchmarkLazyChart>
					{/each}
				{/if}
			</Tabs.Content>
		</Tabs.Root>
	{/if}
</section>
