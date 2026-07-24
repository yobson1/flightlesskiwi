<script lang="ts">
	import SvelteMarkdown, {
		buildUnsupportedHTML,
		defaultRenderers
	} from '@humanspeak/svelte-markdown';
	import BenchmarkCharts from '$lib/components/benchmark-charts.svelte';
	import BenchmarkRunCard from '$lib/components/benchmark-run-card.svelte';
	import Game from '$lib/components/game.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const dateFormatter = new Intl.DateTimeFormat('en', {
		dateStyle: 'long',
		timeZone: 'UTC'
	});
	const markdownRenderers = {
		...defaultRenderers,
		html: buildUnsupportedHTML()
	};
</script>

<svelte:head>
	<title>{data.benchmark.title} · flightlesskiwi</title>
</svelte:head>

<div class="grid items-stretch gap-8 lg:grid-cols-2">
	<div class="min-w-0">
		<Game gameId={data.benchmark.gameId} />
	</div>

	<div class="relative min-w-0">
		<article
			class="min-w-0 lg:absolute lg:inset-0 lg:flex lg:min-h-0 lg:flex-col lg:overflow-hidden lg:border-l lg:pl-8"
		>
			<div class="shrink-0">
				<p class="text-sm font-medium text-primary">Benchmark result</p>
				<h1 class="text-3xl font-bold tracking-tight">{data.benchmark.title}</h1>
				<p class="mt-2 text-sm text-muted-foreground">
					Uploaded by {data.benchmark.username} on
					<time datetime={data.benchmark.createdAt.toISOString()}>
						{dateFormatter.format(data.benchmark.createdAt)}
					</time>
				</p>
			</div>

			{#if data.benchmark.description}
				<div
					class="wrap-break-words prose prose-sm mt-6 max-w-none lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain lg:pr-3 dark:prose-invert"
				>
					<SvelteMarkdown
						source={data.benchmark.description}
						options={{ gfm: true }}
						renderers={markdownRenderers}
					/>
				</div>
			{/if}
		</article>
	</div>
</div>

<section class="mt-4" aria-label="Included benchmark runs">
	<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
		{#each data.runs as run (run.id)}
			<BenchmarkRunCard {run} />
		{/each}
	</div>
</section>

<BenchmarkCharts benchmarkId={data.benchmark.id} runs={data.runs} />
