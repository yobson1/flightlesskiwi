<script lang="ts">
	import SvelteVirtualList from '@humanspeak/svelte-virtual-list';
	import type { SvelteVirtualListRangeInfo } from '@humanspeak/svelte-virtual-list';
	import { onMount, untrack } from 'svelte';
	import type { SvelteMap } from 'svelte/reactivity';
	import { toast } from 'svelte-sonner';
	import BenchmarkPagination from '$lib/components/benchmark-pagination.svelte';
	import BenchmarkListing from '$lib/components/benchmark-listing.svelte';
	import type { BenchmarkListing as Benchmark } from '$lib/client/benchmark-page-cache.svelte';

	type PageChangeReason = 'control' | 'scroll';

	interface SparsePagination {
		benchmarks: SvelteMap<number, Benchmark>;
		indices: number[];
		initialPage: number;
		pageSize: number;
		requestedPage: number;
		totalCount: number;
		totalPages: number;
		loadPageWindow: (page: number) => Promise<void>;
		onPageChange: (page: number, reason: PageChangeReason) => void;
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
	let requestedPageInProgress = $state<number | null>(null);
	let rangeTargetPage = $state<number | null>(null);
	let handledRequestedPage = $state(untrack(() => pagination?.initialPage ?? 1));
	let listItems = $derived<(Benchmark | number)[]>(pagination?.indices ?? benchmarks);

	onMount(() => {
		if (!pagination) return;
		const handleHistoryNavigation = () => {
			const targetPage = readHistoryPage(pagination);
			handledRequestedPage = targetPage;
			if (targetPage !== currentPage) void jumpToPage(targetPage, false);
		};
		window.addEventListener('popstate', handleHistoryNavigation);
		void initializePagination(pagination);
		return () => window.removeEventListener('popstate', handleHistoryNavigation);
	});

	$effect(() => {
		if (!pagination || !readyForRanges) return;
		const requestedPage = pagination.requestedPage;
		if (requestedPage === handledRequestedPage) return;
		if (jumping || rangeTargetPage !== null || requestedPageInProgress !== null) {
			return;
		}
		handledRequestedPage = requestedPage;
		if (
			requestedPage === currentPage ||
			requestedPage < 1 ||
			requestedPage > pagination.totalPages
		) {
			return;
		}
		void jumpToPage(requestedPage, false);
	});

	async function initializePagination(activePagination: SparsePagination) {
		await scrollToPage(activePagination.initialPage, activePagination);
		currentPage = activePagination.initialPage;
		readyForRanges = true;
		void activePagination.loadPageWindow(activePagination.initialPage).catch(showLoadError);
	}

	function handleRangeChange(range: SvelteVirtualListRangeInfo) {
		if (!pagination || !readyForRanges || pagination.totalCount === 0) return;
		const inferredFirstVisibleIndex = Math.min(
			pagination.totalCount - 1,
			range.start === 0 ? 0 : range.start + BUFFER_SIZE + 1
		);
		const visiblePage = Math.floor(inferredFirstVisibleIndex / pagination.pageSize) + 1;
		if (rangeTargetPage !== null) {
			if (visiblePage !== rangeTargetPage) return;
			rangeTargetPage = null;
			return;
		}
		if (visiblePage === currentPage) return;
		currentPage = visiblePage;
		pagination.onPageChange(visiblePage, 'scroll');
		void pagination.loadPageWindow(visiblePage).catch(showLoadError);
	}

	async function jumpToPage(targetPage: number, addHistory = true) {
		if (!pagination || jumping) return;
		const previousPage = currentPage;
		jumping = true;
		requestedPageInProgress = targetPage;
		rangeTargetPage = targetPage;
		currentPage = targetPage;
		try {
			await pagination.loadPageWindow(targetPage);
			await scrollToPage(targetPage, pagination);
			if (addHistory) pagination.onPageChange(targetPage, 'control');
		} catch (cause) {
			rangeTargetPage = null;
			currentPage = previousPage;
			showLoadError(cause);
		} finally {
			requestedPageInProgress = null;
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

	function readHistoryPage(activePagination: SparsePagination) {
		const value = new URL(window.location.href).searchParams.get('page');
		if (value === null) return 1;
		const parsed = Number(value);
		if (!Number.isSafeInteger(parsed) || parsed < 1) return 1;
		return Math.min(parsed, activePagination.totalPages);
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
