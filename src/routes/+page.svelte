<script lang="ts">
	import SvelteVirtualList from '@humanspeak/svelte-virtual-list';
	import { resolve } from '$app/paths';
	import BenchmarkListing from '$lib/components/benchmark-listing.svelte';
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const initialPage = untrack(() => data);
	let benchmarks = $state([...initialPage.benchmarks]);
	let nextCursor = $state(initialPage.nextCursor);
	let loadingMore = $state(false);
	let loadMoreFailed = $state(false);
	let hasMore = $derived(nextCursor !== null && !loadMoreFailed);

	async function loadMore() {
		if (loadingMore || nextCursor === null) return;
		loadingMore = true;
		loadMoreFailed = false;

		try {
			const searchParams = new URLSearchParams({
				before: nextCursor.createdAt.toString(),
				before_id: nextCursor.id
			});
			const response = await fetch(`${resolve('/api/benchmarks')}?${searchParams}`);
			if (!response.ok) throw new Error('Unable to load more benchmarks');

			type Benchmark = (typeof benchmarks)[number];
			const page = (await response.json()) as {
				benchmarks: Array<Omit<Benchmark, 'createdAt'> & { createdAt: string }>;
				nextCursor: typeof nextCursor;
			};
			benchmarks = [
				...benchmarks,
				...page.benchmarks.map((benchmark) => ({
					...benchmark,
					createdAt: new Date(benchmark.createdAt)
				}))
			];
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

	{#if benchmarks.length > 0}
		<div class="h-[calc(100dvh-18rem)] min-h-80">
			<SvelteVirtualList
				items={benchmarks}
				defaultEstimatedItemHeight={116}
				onLoadMore={loadMore}
				loadMoreThreshold={5}
				{hasMore}
				viewportLabel="Recent benchmarks"
			>
				{#snippet renderItem(benchmark)}
					<BenchmarkListing {benchmark} />
				{/snippet}
			</SvelteVirtualList>
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
			<h2 class="font-semibold">No benchmarks yet</h2>
			<p class="mt-1 text-sm text-muted-foreground">Uploaded benchmarks will appear here.</p>
		</div>
	{/if}
</div>
