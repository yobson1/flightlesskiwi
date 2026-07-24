<script lang="ts">
	import Game from '$lib/components/game.svelte';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const dateFormatter = new Intl.DateTimeFormat('en', {
		dateStyle: 'long',
		timeZone: 'UTC'
	});
</script>

<svelte:head>
	<title>{data.benchmark.title} · flightlesskiwi</title>
</svelte:head>

<div class="flex flex-col gap-8">
	<Game gameId={data.benchmark.gameId} />

	<Separator />

	<article>
		<p class="text-sm font-medium text-primary">Benchmark result</p>
		<h1 class="text-3xl font-bold tracking-tight">{data.benchmark.title}</h1>
		<p class="mt-2 text-sm text-muted-foreground">
			Uploaded by {data.benchmark.username} on
			<time datetime={data.benchmark.createdAt.toISOString()}>
				{dateFormatter.format(data.benchmark.createdAt)}
			</time>
		</p>
		{#if data.benchmark.description}
			<p class="mt-4 whitespace-pre-wrap text-muted-foreground">{data.benchmark.description}</p>
		{/if}
	</article>
</div>
