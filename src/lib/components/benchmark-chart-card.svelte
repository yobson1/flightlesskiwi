<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	interface Props {
		title: string;
		description: string;
		chartClass: string;
		children: Snippet;
	}

	let { title, description, chartClass, children }: Props = $props();
</script>

<article class="rounded-xl border bg-card p-4">
	<h3 class="font-semibold">{title}</h3>
	<p class="text-sm text-muted-foreground">{description}</p>

	<div class={cn('mt-4 w-full', chartClass)}>
		{@render children()}
	</div>
</article>
