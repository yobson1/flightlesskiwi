<script lang="ts">
	import SvelteVirtualList from '@humanspeak/svelte-virtual-list';
	import type { SvelteVirtualListRangeInfo } from '@humanspeak/svelte-virtual-list';
	import { onMount, untrack } from 'svelte';
	import type { SvelteMap } from 'svelte/reactivity';
	import { toast } from 'svelte-sonner';
	import BenchmarkPagination from '#lib/components/benchmark-pagination.svelte';
	import BenchmarkListing from '#lib/components/benchmark-listing.svelte';
	import type { BenchmarkListing as Benchmark } from '#lib/client/benchmark-page-cache.svelte.js';

	interface SparsePagination {
		benchmarks: SvelteMap<number, Benchmark>;
		indices: number[];
		initialPage: number;
		pageSize: number;
		totalCount: number;
		totalPages: number;
		loadPageWindow: (page: number) => Promise<void>;
		onPageChange: (page: number) => void;
	}

	interface Props {
		benchmarks: Benchmark[];
		pagination?: SparsePagination;
		viewportLabel: string;
	}

	const BUFFER_SIZE = 20;
	let { benchmarks, pagination, viewportLabel }: Props = $props();
	let virtualList = $state<{
		scroll: (options: {
			index: number;
			smoothScroll?: boolean;
			align?: 'top' | 'bottom' | 'nearest' | 'center';
		}) => Promise<void>;
	}>();
	let currentPage = $state(untrack(() => pagination?.initialPage ?? 1));
	let jumping = $state(false);
	let readyForRanges = $state(untrack(() => pagination === undefined));
	let listItems = $derived<(Benchmark | number)[]>(pagination?.indices ?? benchmarks);

	onMount(() => {
		if (!pagination) return;
		void initializePagination(pagination);
	});

	async function initializePagination(activePagination: SparsePagination) {
		await scrollToPage(activePagination.initialPage, activePagination);
		currentPage = activePagination.initialPage;
		readyForRanges = true;
		void activePagination.loadPageWindow(activePagination.initialPage).catch(showLoadError);
	}

	function handleRangeChange(range: SvelteVirtualListRangeInfo) {
		if (!pagination || !readyForRanges || jumping || pagination.totalCount === 0) return;
		const inferredFirstVisibleIndex = Math.min(
			pagination.totalCount - 1,
			range.start === 0 ? 0 : range.start + BUFFER_SIZE + 1
		);
		const visiblePage = Math.floor(inferredFirstVisibleIndex / pagination.pageSize) + 1;
		if (visiblePage === currentPage) return;
		currentPage = visiblePage;
		pagination.onPageChange(visiblePage);
		void pagination.loadPageWindow(visiblePage).catch(showLoadError);
	}

	async function jumpToPage(targetPage: number) {
		if (!pagination || jumping) return;
		const previousPage = currentPage;
		jumping = true;
		currentPage = targetPage;
		try {
			await pagination.loadPageWindow(targetPage);
			await scrollToPage(targetPage, pagination);
			pagination.onPageChange(targetPage);
		} catch (cause) {
			currentPage = previousPage;
			showLoadError(cause);
		} finally {
			jumping = false;
		}
	}

	function scrollToPage(page: number, activePagination: SparsePagination) {
		return virtualList?.scroll({
			index: (page - 1) * activePagination.pageSize,
			smoothScroll: false,
			align: 'top'
		});
	}

	function showLoadError(cause: unknown) {
		if (cause instanceof Error && cause.name === 'AbortError') return;
		toast.error(cause instanceof Error ? cause.message : 'Unable to load benchmark page');
	}
</script>

<div class="relative left-1/2 min-h-80 w-screen flex-1 -translate-x-1/2">
	<SvelteVirtualList
		bind:this={virtualList}
		items={listItems}
		itemKey={(item) => (typeof item === 'number' ? `slot-${item}` : item.id)}
		defaultEstimatedItemHeight={116}
		bufferSize={BUFFER_SIZE}
		onRangeChange={handleRangeChange}
		{viewportLabel}
	>
		{#snippet renderItem(item)}
			{#if typeof item === 'number'}
				{@const benchmark = pagination?.benchmarks.get(item)}
				{#if benchmark}
					<div class="px-4">
						<div class="mx-auto w-full max-w-7xl">
							<BenchmarkListing {benchmark} />
						</div>
					</div>
				{:else}
					<div class="h-29" aria-hidden="true"></div>
				{/if}
			{:else}
				<div class="px-4">
					<div class="mx-auto w-full max-w-7xl">
						<BenchmarkListing benchmark={item} />
					</div>
				</div>
			{/if}
		{/snippet}
	</SvelteVirtualList>
	{#if pagination && pagination.totalPages > 1}
		<BenchmarkPagination
			count={pagination.totalCount}
			page={currentPage}
			pageSize={pagination.pageSize}
			busy={jumping}
			onPageSelect={jumpToPage}
		/>
	{/if}
</div>
