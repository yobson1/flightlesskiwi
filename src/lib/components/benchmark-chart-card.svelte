<script lang="ts">
	import type { BenchmarkEChartOption, BenchmarkEChartTheme } from '$lib/benchmark-echart';
	import BenchmarkEChart from '$lib/components/benchmark-echart.svelte';
	import { cn } from '$lib/utils';

	interface Props {
		title: string;
		description: string;
		chartClass: string;
		ariaLabel: string;
		createOption: (theme: BenchmarkEChartTheme) => BenchmarkEChartOption;
		dragZoom?: boolean;
	}

	let {
		title,
		description,
		chartClass,
		ariaLabel,
		createOption,
		dragZoom = false
	}: Props = $props();
</script>

<article class="rounded-xl border bg-card p-4">
	<h3 class="font-semibold">{title}</h3>
	<p class="text-sm text-muted-foreground">{description}</p>

	<div class={cn('mt-4 w-full', chartClass)}>
		<BenchmarkEChart {ariaLabel} class="h-full" {createOption} {dragZoom} />
	</div>
</article>
