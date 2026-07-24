<script lang="ts">
	import SvelteVirtualList from '@humanspeak/svelte-virtual-list';
	import { resolve } from '$app/paths';
	import BenchmarkListing from '$lib/components/benchmark-listing.svelte';
	import Search from '$lib/components/search.svelte';
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const initialPage = untrack(() => data);
	let benchmarks = $state([...initialPage.benchmarks]);
	let browsedBenchmarks = $state([...initialPage.benchmarks]);
	let nextCursor = $state(initialPage.nextCursor);
	let loadingMore = $state(false);
	let loadMoreFailed = $state(false);
	let activeSearchQuery = $state('');
	let hasMore = $derived(activeSearchQuery.length === 0 && nextCursor !== null && !loadMoreFailed);

	type Benchmark = (typeof benchmarks)[number];

	async function searchBenchmarks(query: string, signal: AbortSignal): Promise<Benchmark[]> {
		const response = await fetch(resolve('/api/benchmarks/search/[query]', { query }), { signal });
		const data = await response.json();
		if (!response.ok) {
			throw new Error(data.error || `Failed to search benchmarks (${response.status})`);
		}

		return (data as Array<Omit<Benchmark, 'createdAt'> & { createdAt: string }>).map(
			(benchmark) => ({
				...benchmark,
				createdAt: new Date(benchmark.createdAt)
			})
		);
	}

	function setSearchResults(query: string, results: Benchmark[]) {
		activeSearchQuery = query;
		benchmarks = results;
		loadMoreFailed = false;
	}

	function setActiveSearchQuery(query: string) {
		if (activeSearchQuery.length === 0 && query.length > 0) {
			browsedBenchmarks = [...benchmarks];
		}
		activeSearchQuery = query;
	}

	function resetBenchmarkList() {
		activeSearchQuery = '';
		benchmarks = [...browsedBenchmarks];
		loadMoreFailed = false;
	}

	async function loadMore() {
		if (loadingMore || nextCursor === null || activeSearchQuery) return;
		loadingMore = true;
		loadMoreFailed = false;

		try {
			const searchParams = new URLSearchParams({
				before: nextCursor.createdAt.toString(),
				before_id: nextCursor.id
			});
			const response = await fetch(`${resolve('/api/benchmarks')}?${searchParams}`);
			if (!response.ok) throw new Error('Unable to load more benchmarks');

			const page = (await response.json()) as {
				benchmarks: Array<Omit<Benchmark, 'createdAt'> & { createdAt: string }>;
				nextCursor: typeof nextCursor;
			};
			if (activeSearchQuery) return;
			benchmarks = [
				...benchmarks,
				...page.benchmarks.map((benchmark) => ({
					...benchmark,
					createdAt: new Date(benchmark.createdAt)
				}))
			];
			browsedBenchmarks = [...benchmarks];
			nextCursor = page.nextCursor;
		} catch (cause) {
			loadMoreFailed = true;
			toast.error(cause instanceof Error ? cause.message : 'Unable to load more benchmarks');
		} finally {
			loadingMore = false;
		}
	}
</script>

<svelte:head>
	<title>Home · flightlesskiwi</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<div>
		<p class="text-sm font-medium text-primary">Community results</p>
		<h1 class="text-3xl font-bold tracking-tight">Recent benchmarks</h1>
		<p class="mt-2 text-muted-foreground">
			Browse the latest MangoHud and PresentMon benchmark results.
		</p>
	</div>

	<label for="benchmark-search" class="sr-only">Search benchmarks</label>
	<Search
		search={searchBenchmarks}
		onResults={setSearchResults}
		onQueryChange={setActiveSearchQuery}
		onClear={resetBenchmarkList}
		inputId="benchmark-search"
		placeholder="Search benchmarks by title or game..."
	/>

	{#if benchmarks.length > 0}
		<div class="h-[calc(100dvh-22rem)] min-h-80">
			{#key activeSearchQuery}
				<SvelteVirtualList
					items={benchmarks}
					defaultEstimatedItemHeight={116}
					onLoadMore={loadMore}
					loadMoreThreshold={5}
					{hasMore}
					viewportLabel={activeSearchQuery ? 'Benchmark search results' : 'Recent benchmarks'}
				>
					{#snippet renderItem(benchmark)}
						<BenchmarkListing {benchmark} />
					{/snippet}
				</SvelteVirtualList>
			{/key}
		</div>
		{#if loadMoreFailed}
			<p class="text-center text-sm text-muted-foreground">
				Couldn’t load more benchmarks.
				<button type="button" class="font-medium text-primary hover:underline" onclick={loadMore}>
					Try again
				</button>
			</p>
		{/if}
	{:else}
		<div class="rounded-xl border border-dashed p-8 text-center">
			{#if activeSearchQuery}
				<h2 class="font-semibold">No matching benchmarks</h2>
				<p class="mt-1 text-sm text-muted-foreground">Try a different benchmark title or game.</p>
			{:else}
				<h2 class="font-semibold">No benchmarks yet</h2>
				<p class="mt-1 text-sm text-muted-foreground">Uploaded benchmarks will appear here.</p>
			{/if}
		</div>
	{/if}
</div>
