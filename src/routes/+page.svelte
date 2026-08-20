<script lang="ts">
	// TODO: Remove this override once rsvelte-lint supports SvelteKit 3 shallow goto() calls with SvelteURL.
	/* eslint svelte/no-navigation-without-resolve: ["error", { "ignoreGoto": true, "ignoreLinks": true, "ignorePushState": false, "ignoreReplaceState": false }] */
	import FilterIcon from '@lucide/svelte/icons/list-filter';
	import XIcon from '@lucide/svelte/icons/x';
	import { goto, refreshAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page as appPage } from '$app/state';
	import {
		BenchmarkPageCache,
		normalizeBenchmarkPage,
		type BenchmarkListing,
		type BenchmarkPagination,
		type LoadedBenchmarkPage
	} from '#lib/client/benchmark-page-cache.svelte.js';
	import BenchmarkList from '#lib/components/benchmark-list.svelte';
	import GameSearch from '#lib/components/game-search.svelte';
	import Search from '#lib/components/search.svelte';
	import { Button, buttonVariants } from '#lib/components/ui/button/index.js';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import { constructImageUrl } from '#lib/igdb.js';
	import {
		benchmarkAPIErrorSchema,
		benchmarkPageResponseSchema,
		benchmarkSearchResponseSchema,
		type BenchmarkPageResponse
	} from '#lib/types/benchmark-api.js';
	import type { GameSearchResult } from '#lib/types/game.js';
	import { onDestroy, untrack } from 'svelte';
	import { SvelteMap, SvelteURL, SvelteURLSearchParams } from 'svelte/reactivity';
	import { toast } from 'svelte-sonner';
	import type { PageProps } from './$types';
	import * as v from 'valibot';

	let { data }: PageProps = $props();
	const initialPage = untrack(() => data);
	const initialPagination = requirePagination(initialPage.pagination);
	let searchResults = $state<BenchmarkListing[]>([]);
	let activeSearchQuery = $state('');
	let selectedGame = $state<GameSearchResult | null>(initialPage.selectedGame);
	let gameFilterOpen = $state(false);
	let loadingGameFilter = $state(false);
	let benchmarkSearchKey = $state(0);
	let filterController: AbortController | undefined;
	let benchmarkListVersion = $state(0);
	let listInitialPage = $state(initialPagination.page);
	const knownGames = new SvelteMap<number, GameSearchResult>();
	if (initialPage.selectedGame)
		knownGames.set(initialPage.selectedGame.id, initialPage.selectedGame);
	const benchmarkPages = new BenchmarkPageCache(
		{
			benchmarks: [...initialPage.benchmarks],
			pagination: initialPagination
		},
		fetchActiveBenchmarkPage
	);
	onDestroy(() => {
		filterController?.abort();
		benchmarkPages.destroy();
	});

	$effect(() => {
		const urlGameId = readURLPositiveInteger('game_id') ?? null;
		if (urlGameId === (selectedGame?.id ?? null) || loadingGameFilter) return;
		const restoredGame = urlGameId === null ? null : knownGames.get(urlGameId);
		if (urlGameId !== null && !restoredGame) {
			void refreshAll();
			return;
		}
		void applyGameFilter(restoredGame ?? null, false, readURLPositiveInteger('page') ?? 1);
	});

	async function searchBenchmarks(query: string, signal: AbortSignal): Promise<BenchmarkListing[]> {
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
		return mapBenchmarkDates(result.output);
	}

	function setSearchResults(query: string, results: BenchmarkListing[]) {
		activeSearchQuery = query;
		searchResults = results;
	}

	function setActiveSearchQuery(query: string) {
		activeSearchQuery = query;
	}

	function resetBenchmarkList() {
		activeSearchQuery = '';
		searchResults = [];
	}

	function mapBenchmarkDates(benchmarks: BenchmarkPageResponse['benchmarks']) {
		return benchmarks.map((benchmark) => ({
			...benchmark,
			createdAt: new Date(benchmark.createdAt)
		}));
	}

	async function fetchBenchmarkPage(
		pageNumber: number,
		gameId: number | undefined,
		signal: AbortSignal
	): Promise<LoadedBenchmarkPage> {
		const searchParams = new SvelteURLSearchParams({ page: pageNumber.toString() });
		if (gameId !== undefined) searchParams.set('game_id', gameId.toString());
		const response = await fetch(`${resolve('api/benchmarks')}?${searchParams}`, { signal });
		const responseData: unknown = await response.json();
		if (!response.ok) {
			const errorResult = v.safeParse(benchmarkAPIErrorSchema, responseData);
			throw new Error(
				errorResult.success && errorResult.output.message
					? errorResult.output.message
					: `Unable to load benchmark page (${response.status})`
			);
		}
		const pageResult = v.safeParse(benchmarkPageResponseSchema, responseData);
		if (!pageResult.success) throw new Error('Invalid benchmark page response');
		return normalizeBenchmarkPage(pageResult.output);
	}

	function fetchActiveBenchmarkPage(pageNumber: number, signal: AbortSignal) {
		return fetchBenchmarkPage(pageNumber, selectedGame?.id, signal);
	}

	async function applyGameFilter(game: GameSearchResult | null, updateURL = true, pageNumber = 1) {
		filterController?.abort();
		const controller = new AbortController();
		filterController = controller;
		gameFilterOpen = false;
		loadingGameFilter = true;

		try {
			const loadedPage = await fetchBenchmarkPage(pageNumber, game?.id, controller.signal);
			if (controller.signal.aborted) return;
			if (game) knownGames.set(game.id, game);
			selectedGame = game;
			benchmarkPages.reset(loadedPage, fetchActiveBenchmarkPage);
			listInitialPage = loadedPage.pagination.page;
			benchmarkListVersion += 1;
			benchmarkSearchKey += 1;
			activeSearchQuery = '';
			searchResults = [];
			if (updateURL) updateFilterURL(game);
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

	function handlePageChange(pageNumber: number) {
		const url = new SvelteURL(window.location.href);
		if (pageNumber === 1) url.searchParams.delete('page');
		else url.searchParams.set('page', pageNumber.toString());
		// This is the current application URL with only its query changed.
		void goto(url, { shallow: true, replace: true, state: appPage.state });
	}

	function updateFilterURL(game: GameSearchResult | null) {
		const url = new SvelteURL(window.location.href);
		url.searchParams.delete('page');
		if (game) url.searchParams.set('game_id', game.id.toString());
		else url.searchParams.delete('game_id');
		// This is the current application URL with only its query changed.
		void goto(url, {
			shallow: true,
			replace: true,
			state: appPage.state
		});
	}

	function readURLPositiveInteger(name: string): number | null {
		const value = appPage.url.searchParams.get(name);
		if (value === null) return null;
		const result = v.safeParse(
			v.pipe(v.string(), v.regex(/^[1-9]\d*$/), v.transform(Number), v.safeInteger()),
			value
		);
		return result.success ? result.output : null;
	}

	function requirePagination(pagination: BenchmarkPageResponse['pagination']): BenchmarkPagination {
		if (pagination === null) throw new Error('Missing benchmark pagination metadata');
		return pagination;
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
					title="Filter by game"><FilterIcon /></Popover.Trigger
				>

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
	{:else if activeSearchQuery ? searchResults.length > 0 : benchmarkPages.pagination.totalCount > 0}
		{#key `${activeSearchQuery}:${benchmarkListVersion}`}
			<BenchmarkList
				benchmarks={activeSearchQuery ? searchResults : []}
				pagination={activeSearchQuery
					? undefined
					: {
							benchmarks: benchmarkPages.benchmarks,
							indices: benchmarkPages.indices,
							initialPage: listInitialPage,
							pageSize: benchmarkPages.pagination.pageSize,
							totalCount: benchmarkPages.pagination.totalCount,
							totalPages: benchmarkPages.pagination.totalPages,
							loadPageWindow: (pageNumber) => benchmarkPages.loadPageWindow(pageNumber),
							onPageChange: handlePageChange
						}}
				viewportLabel={activeSearchQuery
					? 'Benchmark search results'
					: selectedGame
						? `${selectedGame.name} benchmarks`
						: 'Recent benchmarks'}
			/>
		{/key}
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
