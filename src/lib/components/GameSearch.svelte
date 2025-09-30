<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { constructImageUrl } from '$lib/igdb';
	import type { GameSearchResult } from '$lib/types/igdb';
	import { fly } from 'svelte/transition';
	import LineMdSearchTwotone from '$lib/components/icons/LineMdSearchTwotone.svelte';
	import LineMdLoadingTwotoneLoop from '~icons/line-md/loading-twotone-loop';
	import { Skeleton } from '$lib/components/ui/skeleton';

	// Props

	interface Props {
		onSelected?: (gameId: number) => void;
		noParent?: boolean;
	}

	let { onSelected, noParent = false }: Props = $props();

	// State

	let searchQuery = $state('');
	let results = $state<GameSearchResult[]>([]);
	let loading = $state(false);
	let open = $state(false);
	let errorMessage = $state<string | null>(null);
	let imageLoadingStates = $state<Record<number, boolean>>({});
	let isMouseOverResults = false;

	// Derived state

	let hasResults = $derived(results.length > 0);
	let shouldShowDropdown = $derived(open && searchQuery.trim());

	// Async tracking

	let debounceTimer: ReturnType<typeof setTimeout> | undefined;
	let abortController: AbortController | undefined;
	let currentSearchQuery = '';

	// Search logic

	async function searchGames(query: string) {
		abortController?.abort();
		abortController = new AbortController();

		// Track this search query to ignore stale results
		currentSearchQuery = query;
		const thisSearchQuery = query;

		resetSearch(true);
		errorMessage = null;

		try {
			const response = await fetch(`/api/game/search/${encodeURIComponent(query)}`, {
				signal: abortController.signal
			});
			const data = await response.json();

			// Ignore stale results
			if (thisSearchQuery !== currentSearchQuery) {
				console.log(
					`ignoring stale results for "${thisSearchQuery}" (current: "${currentSearchQuery}")`
				);
				return;
			}

			if (response.ok) {
				results = data;
				initializeImageLoadingStates(data);
			} else {
				errorMessage = data.error || `Failed to search games (${response.status})`;
				results = [];
			}
		} catch (error) {
			// these are expected when we cancel requests
			if (error instanceof Error && error.name === 'AbortError') {
				console.log(`aborted "${thisSearchQuery}" search`);
				return;
			}

			console.error('Search error:', error);
			errorMessage = error instanceof Error ? error.message : 'Failed to search games';
			results = [];
		} finally {
			// only update loading state if this is still the current search
			if (thisSearchQuery === currentSearchQuery) {
				loading = false;
			}
		}
	}

	// Event Handlers

	function handleInput(event: Event) {
		const target = event.target as HTMLInputElement;
		searchQuery = target.value;

		clearTimeout(debounceTimer);

		if (!searchQuery.trim()) {
			resetSearch(false);
			return;
		}

		debounceTimer = setTimeout(() => {
			searchGames(searchQuery);
		}, 350);
	}

	function handleBlur() {
		if (!isMouseOverResults) {
			open = false;
		}
	}

	function handleFocus() {
		// reopen if we have results and a search query
		if (hasResults && searchQuery.trim()) {
			open = true;
		}
	}

	function selectGame(game: GameSearchResult) {
		console.log(`Selected game: ${game.name}[${game.id}]`);
		open = false;
		isMouseOverResults = false;

		onSelected?.(noParent ? game.id : (game.parent_game ?? game.version_parent ?? game.id));
	}

	function handleImageLoad(gameId: number) {
		imageLoadingStates[gameId] = false;
	}

	// Util

	function initializeImageLoadingStates(games: GameSearchResult[]) {
		const newLoadingStates: Record<number, boolean> = {};
		for (const game of games) {
			if (game.cover?.image_id) {
				newLoadingStates[game.id] = true;
			}
		}
		imageLoadingStates = newLoadingStates;
	}

	function resetSearch(isSearching: boolean) {
		results = [];
		imageLoadingStates = {};
		open = isSearching;
		loading = isSearching;
	}
</script>

<div class="relative">
	<div class="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">
		{#if loading}
			<LineMdLoadingTwotoneLoop class="h-4 w-4" />
		{:else}
			<LineMdSearchTwotone class="h-4 w-4" />
		{/if}
	</div>
	<Input
		type="text"
		placeholder="Search for a game..."
		value={searchQuery}
		oninput={handleInput}
		onblur={handleBlur}
		onfocus={handleFocus}
		class="pl-10"
	/>
	{#if shouldShowDropdown}
		<div
			role="listbox"
			tabindex="-1"
			class="absolute z-50 mt-2 w-full rounded-md border bg-popover text-popover-foreground shadow-md outline-none"
			transition:fly={{ y: -5, duration: 150 }}
			onmouseenter={() => (isMouseOverResults = true)}
			onmouseleave={() => (isMouseOverResults = false)}
		>
			{#if loading}
				<div class="p-4 text-center text-sm text-muted-foreground">Loading...</div>
			{:else if errorMessage}
				<div class="p-4 text-center text-sm text-destructive">Error: {errorMessage}</div>
			{:else if !hasResults}
				<div class="p-4 text-center text-sm text-muted-foreground">No games found</div>
			{:else}
				<div class="max-h-[400px] overflow-y-auto [&>button:not(:last-child)]:border-b">
					{#each results as game (game.id)}
						<button
							type="button"
							class="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-accent"
							onclick={() => selectGame(game)}
						>
							<div class="relative h-16 w-12">
								{#if game.cover?.image_id}
									{#if imageLoadingStates[game.id] !== false}
										<Skeleton class="absolute inset-0 rounded" />
									{/if}
									<img
										src={constructImageUrl(game.cover.image_id, 'cover_small')}
										alt={game.name}
										class="absolute inset-0 rounded object-cover text-transparent"
										onload={() => handleImageLoad(game.id)}
									/>
								{:else}
									<Skeleton class="absolute inset-0 rounded" />
								{/if}
							</div>
							<div class="min-w-0 flex-1">
								<div class="truncate font-medium">{game.name}</div>
								{#if game.first_release_date}
									<div class="text-sm text-muted-foreground">
										{new Date(game.first_release_date * 1000).getFullYear()}
									</div>
								{/if}
							</div>
						</button>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>
