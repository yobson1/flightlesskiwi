<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { ChartConfig } from '$lib/components/ui/chart';
	import * as Chart from '$lib/components/ui/chart';
	import { cn } from '$lib/utils';

	interface Props {
		title: string;
		description: string;
		config: ChartConfig;
		chartClass: string;
		children: Snippet;
	}

	let { title, description, config, chartClass, children }: Props = $props();
</script>

<article class="rounded-xl border bg-card p-4">
	<h3 class="font-semibold">{title}</h3>
	<p class="text-sm text-muted-foreground">{description}</p>

	<Chart.Container {config} class={cn('mt-4 aspect-auto w-full', chartClass)}>
		{@render children()}
	</Chart.Container>
</article>
