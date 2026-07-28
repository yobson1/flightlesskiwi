<script lang="ts">
	import { ChartNoAxesCombined } from '@lucide/svelte';
	import {
		hasNonZeroMetricValues,
		sortBenchmarkChartRunsByAverageFps,
		type BenchmarkChartRun
	} from '$lib/benchmark-chart';
	import BenchmarkFpsSummaryChart from '$lib/components/benchmark-fps-summary-chart.svelte';
	import BenchmarkFrametimeClassificationChart from '$lib/components/benchmark-frametime-classification-chart.svelte';
	import BenchmarkFrametimeDistributionChart from '$lib/components/benchmark-frametime-distribution-chart.svelte';
	import BenchmarkFrametimeStabilityChart from '$lib/components/benchmark-frametime-stability-chart.svelte';
	import BenchmarkFrametimeVarianceChart from '$lib/components/benchmark-frametime-variance-chart.svelte';
	import BenchmarkMetricAverageChart from '$lib/components/benchmark-metric-average-chart.svelte';
	import BenchmarkMetricLineChart from '$lib/components/benchmark-metric-line-chart.svelte';
	import * as Tabs from '$lib/components/ui/tabs';
	import type { BenchmarkMetric } from '$lib/benchmark-run';

	interface Props {
		benchmarkId: string;
		runs: BenchmarkChartRun[];
	}

	let { benchmarkId, runs }: Props = $props();

	const orderedRuns = $derived(sortBenchmarkChartRunsByAverageFps(runs));
	const metrics = $derived.by(() => {
		const metrics: BenchmarkMetric[] = [];
		for (const run of orderedRuns) {
			for (const metric of run.benchmarkRun?.data.metrics ?? []) {
				if (
					hasNonZeroMetricValues(metric.values) &&
					!metrics.some(({ key }) => key === metric.key)
				) {
					metrics.push(metric);
				}
			}
		}
		return metrics;
	});
	const hasFps = $derived(metrics.some(({ key }) => key === 'fps'));
	const frametimeMetric = $derived(metrics.find(({ key }) => key === 'frametime'));
</script>

<section class="mt-8" aria-labelledby="benchmark-charts-heading">
	<div class="mb-4 flex items-center gap-2">
		<ChartNoAxesCombined class="size-5 text-primary" />
		<h2 id="benchmark-charts-heading" class="text-xl font-semibold">Benchmark charts</h2>
	</div>

	{#if metrics.length === 0}
		<div class="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
			No supported performance data could be read from the included files.
		</div>
	{:else}
		<Tabs.Root value="performance" class="gap-0">
			<Tabs.List variant="connected">
				<Tabs.Trigger value="performance">Performance</Tabs.Trigger>
				<Tabs.Trigger value="summary">Summary</Tabs.Trigger>
				<Tabs.Trigger value="all-data">All data</Tabs.Trigger>
			</Tabs.List>

			<Tabs.Content value="performance" class="mt-4 space-y-4">
				{#if hasFps}
					<BenchmarkFpsSummaryChart {benchmarkId} runs={orderedRuns} />
				{/if}
				{#if frametimeMetric}
					<BenchmarkFrametimeStabilityChart {benchmarkId} runs={orderedRuns} />
					<BenchmarkMetricLineChart
						runs={orderedRuns}
						metric={frametimeMetric}
						description="Frame pacing throughout each run with a moving average. Lower and more consistent is better."
					/>
					<div class="grid gap-4 lg:grid-cols-2">
						<div class="lg:col-span-2">
							<BenchmarkFrametimeDistributionChart runs={orderedRuns} />
						</div>
						{#each orderedRuns as run (run.id)}
							<BenchmarkFrametimeClassificationChart {run} />
							<BenchmarkFrametimeVarianceChart {run} />
						{/each}
					</div>
				{/if}
			</Tabs.Content>

			<Tabs.Content value="summary" class="mt-4 grid gap-4 lg:grid-cols-2">
				{#each metrics as metric (metric.key)}
					<BenchmarkMetricAverageChart {benchmarkId} runs={orderedRuns} {metric} />
				{/each}
			</Tabs.Content>

			<Tabs.Content value="all-data" class="mt-4 space-y-4">
				{#each metrics as metric (metric.key)}
					<BenchmarkMetricLineChart runs={orderedRuns} {metric} />
				{/each}
			</Tabs.Content>
		</Tabs.Root>
	{/if}
</section>
