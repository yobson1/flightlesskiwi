<script lang="ts">
	import FilterIcon from '@lucide/svelte/icons/list-filter';
	import XIcon from '@lucide/svelte/icons/x';
	import SvelteVirtualList from '@humanspeak/svelte-virtual-list';
	import { resolve } from '$app/paths';
	import BenchmarkListing from '$lib/components/benchmark-listing.svelte';
	import GameSearch from '$lib/components/game-search.svelte';
	import Search from '$lib/components/search.svelte';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import * as Popover from '$lib/components/ui/popover';
	import { constructImageUrl } from '$lib/igdb';
	import {
		benchmarkAPIErrorSchema,
		benchmarkPageResponseSchema,
		benchmarkSearchResponseSchema,
		type BenchmarkPageResponse
	} from '$lib/types/benchmark-api';
	import type { GameSearchResult } from '$lib/types/game';
	import { onDestroy, untrack } from 'svelte';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { toast } from 'svelte-sonner';
	import type { PageProps } from './$types';
	import * as v from 'valibot';

	let { data }: PageProps = $props();
	const initialPage = untrack(() => data);
	let benchmarks = $state([...initialPage.benchmarks]);
	let browsedBenchmarks = $state([...initialPage.benchmarks]);
	let nextCursor = $state(initialPage.nextCursor);
	let loadingMore = $state(false);
	let loadMoreFailed = $state(false);
	let activeSearchQuery = $state('');
	let selectedGame = $state<GameSearchResult | null>(null);
	let gameFilterOpen = $state(false);
	let loadingGameFilter = $state(false);
	let benchmarkSearchKey = $state(0);
	let filterController: AbortController | undefined;
	let benchmarkListVersion = 0;
	let hasMore = $derived(
		activeSearchQuery.length === 0 && nextCursor !== null && !loadMoreFailed && !loadingGameFilter
	);

	type Benchmark = (typeof benchmarks)[number];
	onDestroy(() => filterController?.abort());

	async function searchBenchmarks(query: string, signal: AbortSignal): Promise<Benchmark[]> {
		const searchParams = new SvelteURLSearchParams();
		if (selectedGame) searchParams.set('game_id', selectedGame.id.toString());
		const searchSuffix = searchParams.size > 0 ? `?${searchParams}` : '';
		const response = await fetch(
			`${resolve('/api/benchmarks/search/[query]', { query })}${searchSuffix}`,
			{ signal }
		);
		const data: unknown = await response.json();
		if (!response.ok) {
			const errorResult = v.safeParse(benchmarkAPIErrorSchema, data);
			throw new Error(
				errorResult.success && errorResult.output.error
					? errorResult.output.error
					: `Failed to search benchmarks (${response.status})`
			);
		}
		const result = v.safeParse(benchmarkSearchResponseSchema, data);
		if (!result.success) throw new Error('Invalid benchmark search response');
		return mapBenchmarkDates({ benchmarks: result.output, nextCursor: null });
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

	function mapBenchmarkDates(page: BenchmarkPageResponse) {
		return page.benchmarks.map((benchmark) => ({
			...benchmark,
			createdAt: new Date(benchmark.createdAt)
		}));
	}

	async function applyGameFilter(game: GameSearchResult | null) {
		filterController?.abort();
		const controller = new AbortController();
		filterController = controller;
		benchmarkListVersion += 1;
		selectedGame = game;
		gameFilterOpen = false;
		benchmarkSearchKey += 1;
		activeSearchQuery = '';
		benchmarks = [];
		browsedBenchmarks = [];
		nextCursor = null;
		loadMoreFailed = false;
		loadingGameFilter = true;

		try {
			const searchParams = new SvelteURLSearchParams();
			if (game) searchParams.set('game_id', game.id.toString());
			const suffix = searchParams.size > 0 ? `?${searchParams}` : '';
			const response = await fetch(`${resolve('/api/benchmarks')}${suffix}`, {
				signal: controller.signal
			});
			const data: unknown = await response.json();
			if (!response.ok) {
				const errorResult = v.safeParse(benchmarkAPIErrorSchema, data);
				throw new Error(
					errorResult.success && errorResult.output.message
						? errorResult.output.message
						: 'Unable to apply the game filter'
				);
			}
			const pageResult = v.safeParse(benchmarkPageResponseSchema, data);
			if (!pageResult.success) throw new Error('Invalid benchmark page response');
			const page = pageResult.output;
			if (controller.signal.aborted || activeSearchQuery) return;

			benchmarks = mapBenchmarkDates(page);
			browsedBenchmarks = [...benchmarks];
			nextCursor = page.nextCursor;
		} catch (cause) {
			if (cause instanceof Error && cause.name === 'AbortError') return;
			toast.error(cause instanceof Error ? cause.message : 'Unable to apply the game filter');
		} finally {
			if (filterController === controller) {
				filterController = undefined;
				loadingGameFilter = false;
			}
		}
	}

	function selectGame(_: number, game: GameSearchResult) {
		void applyGameFilter(game);
	}

	async function loadMore() {
		if (loadingMore || loadingGameFilter || nextCursor === null || activeSearchQuery) return;
		const requestedListVersion = benchmarkListVersion;
		loadingMore = true;
		loadMoreFailed = false;

		try {
			const searchParams = new SvelteURLSearchParams({
				before: nextCursor.createdAt.toString(),
				before_id: nextCursor.id
			});
			if (selectedGame) searchParams.set('game_id', selectedGame.id.toString());
			const response = await fetch(`${resolve('/api/benchmarks')}?${searchParams}`);
			if (!response.ok) throw new Error('Unable to load more benchmarks');

			const pageResult = v.safeParse(benchmarkPageResponseSchema, await response.json());
			if (!pageResult.success) throw new Error('Invalid benchmark page response');
			const page = pageResult.output;
			if (activeSearchQuery || requestedListVersion !== benchmarkListVersion) return;
			benchmarks = [...benchmarks, ...mapBenchmarkDates(page)];
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

<div class="-mb-8 flex h-[calc(100%+2rem)] min-h-0 flex-col gap-6">
	<div>
		<p class="text-sm font-medium text-primary">Community results</p>
		<h1 class="text-3xl font-bold tracking-tight">Recent benchmarks</h1>
		<p class="mt-2 text-muted-foreground">
			Browse the latest MangoHud and CapFrameX benchmark results.
		</p>
	</div>

	<div class="flex flex-col gap-2">
		<div class="flex items-start gap-2">
			<div class="min-w-0 flex-1">
				<label for="benchmark-search" class="sr-only">Search benchmarks</label>
				{#key benchmarkSearchKey}
					<Search
						search={searchBenchmarks}
						onResults={setSearchResults}
						onQueryChange={setActiveSearchQuery}
						onClear={resetBenchmarkList}
						inputId="benchmark-search"
						placeholder="Search by title, game or run configuration..."
					/>
				{/key}
			</div>
			<Popover.Root bind:open={gameFilterOpen}>
				<Popover.Trigger
					class={buttonVariants({
						variant: selectedGame ? 'secondary' : 'outline',
						size: 'icon'
					})}
					aria-label="Filter benchmarks by game"
					title="Filter by game"
				>
					<FilterIcon />
				</Popover.Trigger>
				<Popover.Content align="end" class="w-[min(24rem,calc(100vw-2rem))]">
					<Popover.Header>
						<Popover.Title>Filter by game</Popover.Title>
						<Popover.Description>
							Choose a game, then search within its benchmark results.
						</Popover.Description>
					</Popover.Header>
					<label for="benchmark-game-filter" class="sr-only">Search for a game</label>
					<GameSearch onSelected={selectGame} noParent inputId="benchmark-game-filter" />
				</Popover.Content>
			</Popover.Root>
		</div>

		{#if selectedGame}
			<div
				class="flex w-fit max-w-full items-center gap-2 rounded-full border bg-muted/50 py-1 pr-1 pl-1.5 text-sm"
			>
				{#if selectedGame.coverImgId}
					<img
						src={constructImageUrl(selectedGame.coverImgId, 'micro')}
						alt=""
						class="size-6 rounded-full object-cover"
					/>
				{:else}
					<FilterIcon class="ml-1 size-3.5 text-muted-foreground" />
				{/if}
				<span class="truncate">
					<span class="text-muted-foreground">Game:</span>
					{selectedGame.name}
				</span>
				<Button
					variant="ghost"
					size="icon-xs"
					aria-label={`Remove ${selectedGame.name} filter`}
					title="Remove game filter"
					onclick={() => void applyGameFilter(null)}
				>
					<XIcon />
				</Button>
			</div>
		{/if}
	</div>

	{#if loadingGameFilter}
		<div class="rounded-xl border border-dashed p-8 text-center">
			<p class="text-sm text-muted-foreground">Loading benchmark results…</p>
		</div>
	{:else if benchmarks.length > 0}
		<div class="relative left-1/2 min-h-80 w-screen flex-1 -translate-x-1/2">
			{#key activeSearchQuery}
				<SvelteVirtualList
					items={benchmarks}
					defaultEstimatedItemHeight={116}
					onLoadMore={loadMore}
					loadMoreThreshold={5}
					{hasMore}
					viewportLabel={activeSearchQuery
						? 'Benchmark search results'
						: selectedGame
							? `${selectedGame.name} benchmarks`
							: 'Recent benchmarks'}
				>
					{#snippet renderItem(benchmark)}
						<div class="px-4">
							<div class="mx-auto w-full max-w-7xl">
								<BenchmarkListing {benchmark} />
							</div>
						</div>
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
				<p class="mt-1 text-sm text-muted-foreground">
					Try a different title, GPU, CPU or run name.
				</p>
			{:else if selectedGame}
				<h2 class="font-semibold">No benchmarks for {selectedGame.name}</h2>
				<p class="mt-1 text-sm text-muted-foreground">
					Remove the game filter to browse all benchmarks.
				</p>
			{:else}
				<h2 class="font-semibold">No benchmarks yet</h2>
				<p class="mt-1 text-sm text-muted-foreground">Uploaded benchmarks will appear here.</p>
			{/if}
		</div>
	{/if}
</div>
