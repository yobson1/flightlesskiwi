<script lang="ts" generics="T">
	import { onDestroy, type Snippet } from 'svelte';
	import { fly } from 'svelte/transition';
	import { Input } from '$lib/components/ui/input';
	import LineMdSearchTwotone from '$lib/components/icons/line-md-search-twotone.svelte';
	import LineMdLoadingTwotoneLoop from '~icons/line-md/loading-twotone-loop';

	interface Props {
		search: (query: string, signal: AbortSignal) => Promise<T[]>;
		getKey?: (result: T) => string | number;
		getLabel?: (result: T) => string;
		onSelected?: (result: T) => void;
		onResults?: (query: string, results: T[]) => void;
		onQueryChange?: (query: string) => void;
		onClear?: () => void;
		result?: Snippet<[result: T]>;
		inputId?: string;
		placeholder?: string;
		noResultsText?: string;
		debounceMs?: number;
	}

	let {
		search,
		getKey,
		getLabel,
		onSelected,
		onResults,
		onQueryChange,
		onClear,
		result,
		inputId,
		placeholder = 'Search...',
		noResultsText = 'No results found',
		debounceMs = 350
	}: Props = $props();

	let searchQuery = $state('');
	let results = $state<T[]>([]);
	let loading = $state(false);
	let open = $state(false);
	let errorMessage = $state<string | null>(null);
	let selectedIndex = $state(-1);
	let resultButtons = $state<HTMLButtonElement[]>([]);
	let isMouseOverResults = false;

	let hasResults = $derived(results.length > 0);
	let hasDropdown = $derived(result !== undefined);
	let shouldShowDropdown = $derived(hasDropdown && open && searchQuery.trim().length > 0);

	let debounceTimer: ReturnType<typeof setTimeout> | undefined;
	let abortController: AbortController | undefined;
	let currentSearchQuery = '';

	onDestroy(() => {
		clearTimeout(debounceTimer);
		abortController?.abort();
	});

	async function executeSearch(query: string) {
		abortController?.abort();
		abortController = new AbortController();
		currentSearchQuery = query;
		const thisSearchQuery = query;

		resetResults(true);
		errorMessage = null;

		try {
			const nextResults = await search(query, abortController.signal);
			if (thisSearchQuery !== currentSearchQuery) return;

			results = nextResults;
			onResults?.(query, nextResults);
		} catch (cause) {
			if (cause instanceof Error && cause.name === 'AbortError') return;
			if (thisSearchQuery !== currentSearchQuery) return;

			console.error('Search error:', cause);
			errorMessage = cause instanceof Error ? cause.message : 'Search failed';
			results = [];
			onResults?.(query, []);
		} finally {
			if (thisSearchQuery === currentSearchQuery) loading = false;
		}
	}

	function handleInput(event: Event) {
		const target = event.target as HTMLInputElement;
		searchQuery = target.value;
		onQueryChange?.(searchQuery.trim());
		clearTimeout(debounceTimer);

		const query = searchQuery.trim();
		if (!query) {
			clearSearch();
			return;
		}

		debounceTimer = setTimeout(() => executeSearch(query), debounceMs);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (!shouldShowDropdown || !hasResults) return;

		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				selectedIndex = selectedIndex < results.length - 1 ? selectedIndex + 1 : 0;
				scrollToSelected();
				break;
			case 'ArrowUp':
				event.preventDefault();
				selectedIndex = selectedIndex > 0 ? selectedIndex - 1 : results.length - 1;
				scrollToSelected();
				break;
			case 'Enter': {
				event.preventDefault();
				const selectedResult = results[selectedIndex];
				if (selectedResult !== undefined) selectResult(selectedResult);
				break;
			}
			case 'Escape':
				event.preventDefault();
				open = false;
				selectedIndex = -1;
				break;
		}
	}

	function handleBlur() {
		if (!isMouseOverResults) open = false;
	}

	function handleFocus(event: FocusEvent) {
		const target = event.target as HTMLInputElement;

		if (searchQuery === '' && target.value.trim()) {
			searchQuery = target.value;
			onQueryChange?.(searchQuery.trim());
			executeSearch(searchQuery.trim());
			return;
		}

		if (hasResults && searchQuery.trim()) open = true;
	}

	function selectResult(selectedResult: T) {
		clearTimeout(debounceTimer);
		abortController?.abort();
		currentSearchQuery = '';
		searchQuery = getLabel?.(selectedResult) ?? searchQuery;
		open = false;
		isMouseOverResults = false;
		selectedIndex = -1;
		onSelected?.(selectedResult);
	}

	function scrollToSelected() {
		resultButtons[selectedIndex]?.scrollIntoView({
			behavior: 'smooth',
			block: 'nearest'
		});
	}

	function clearSearch() {
		abortController?.abort();
		currentSearchQuery = '';
		errorMessage = null;
		resetResults(false);
		onClear?.();
	}

	function resetResults(isSearching: boolean) {
		results = [];
		resultButtons = [];
		open = isSearching;
		loading = isSearching;
		selectedIndex = -1;
	}
</script>

<div>
	<div class="relative">
		<div class="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">
			{#if loading}
				<LineMdLoadingTwotoneLoop class="size-4" />
			{:else}
				<LineMdSearchTwotone class="size-4" />
			{/if}
		</div>
		<Input
			id={inputId}
			type="search"
			{placeholder}
			value={searchQuery}
			autocomplete="off"
			oninput={handleInput}
			onblur={handleBlur}
			onfocus={handleFocus}
			onkeydown={handleKeydown}
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
					<div class="p-4 text-center text-sm text-muted-foreground">{noResultsText}</div>
				{:else}
					<div class="max-h-100 overflow-y-auto [&>button:not(:last-child)]:border-b">
						{#each results as searchResult, index (getKey?.(searchResult) ?? index)}
							<button
								bind:this={resultButtons[index]}
								type="button"
								role="option"
								aria-selected={index === selectedIndex}
								class="w-full p-3 text-left transition-colors active:bg-accent"
								class:bg-accent={index === selectedIndex}
								onclick={() => selectResult(searchResult)}
								onmouseenter={() => (selectedIndex = index)}
							>
								{@render result?.(searchResult)}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	</div>

	{#if !hasDropdown && errorMessage}
		<p class="mt-2 text-sm text-destructive" role="alert">{errorMessage}</p>
	{/if}
</div>
