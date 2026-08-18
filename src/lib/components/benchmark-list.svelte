<script lang="ts">
	import SvelteVirtualList from '@humanspeak/svelte-virtual-list';
	import BenchmarkListing from '$lib/components/benchmark-listing.svelte';

	interface Benchmark {
		id: string;
		title: string;
		cpus: string[];
		gpus: string[];
		createdAt: Date;
		username: string;
		gameName: string | null;
		coverImgId: string | null;
	}

	interface Props {
		benchmarks: Benchmark[];
		hasMore: boolean;
		onLoadMore: () => void | Promise<void>;
		viewportLabel: string;
	}

	let { benchmarks, hasMore, onLoadMore, viewportLabel }: Props = $props();
</script>

<div class="relative left-1/2 min-h-80 w-screen flex-1 -translate-x-1/2">
	<SvelteVirtualList
		items={benchmarks}
		defaultEstimatedItemHeight={116}
		{onLoadMore}
		loadMoreThreshold={5}
		{hasMore}
		{viewportLabel}
	>
		{#snippet renderItem(benchmark)}
			<div class="px-4">
				<div class="mx-auto w-full max-w-7xl">
					<BenchmarkListing {benchmark} />
				</div>
			</div>
		{/snippet}
	</SvelteVirtualList>
</div>
