<script lang="ts">
	import { resolve } from '$app/paths';
	import BenchmarkList from '$lib/components/benchmark-list.svelte';
	import Blobatar from '$lib/components/blobatar.svelte';
	import {
		benchmarkPageResponseSchema,
		type BenchmarkPageResponse
	} from '$lib/types/benchmark-api';
	import { untrack } from 'svelte';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { toast } from 'svelte-sonner';
	import type { PageProps } from './$types';
	import * as v from 'valibot';

	let { data }: PageProps = $props();
	const initialPage = untrack(() => data);
	let benchmarks = $state([...initialPage.benchmarks]);
	let nextCursor = $state(initialPage.nextCursor);
	let loadingMore = $state(false);
	let loadMoreFailed = $state(false);
	let hasMore = $derived(nextCursor !== null && !loadMoreFailed);
	let loadedUsername = initialPage.profile.username;
	let benchmarkListVersion = 0;

	$effect.pre(() => {
		const username = data.profile.username;
		if (username === loadedUsername) return;

		loadedUsername = username;
		benchmarkListVersion += 1;
		benchmarks = [...data.benchmarks];
		nextCursor = data.nextCursor;
		loadingMore = false;
		loadMoreFailed = false;
	});

	function mapBenchmarkDates(page: BenchmarkPageResponse) {
		return page.benchmarks.map((benchmark) => ({
			...benchmark,
			createdAt: new Date(benchmark.createdAt)
		}));
	}

	async function loadMore() {
		if (loadingMore || nextCursor === null) return;
		const cursor = nextCursor;
		const username = data.profile.username;
		const requestedListVersion = benchmarkListVersion;
		loadingMore = true;
		loadMoreFailed = false;

		try {
			const searchParams = new SvelteURLSearchParams({
				before: cursor.createdAt.toString(),
				before_id: cursor.id
			});
			const endpoint = resolve('/api/profiles/[username]/benchmarks', {
				username
			});
			const response = await fetch(`${endpoint}?${searchParams}`);
			if (!response.ok) throw new Error('Unable to load more benchmarks');

			const result = v.safeParse(benchmarkPageResponseSchema, await response.json());
			if (!result.success) throw new Error('Invalid benchmark page response');
			if (requestedListVersion !== benchmarkListVersion) return;
			benchmarks = [...benchmarks, ...mapBenchmarkDates(result.output)];
			nextCursor = result.output.nextCursor;
		} catch (cause) {
			if (requestedListVersion !== benchmarkListVersion) return;
			loadMoreFailed = true;
			toast.error(cause instanceof Error ? cause.message : 'Unable to load more benchmarks');
		} finally {
			if (requestedListVersion === benchmarkListVersion) loadingMore = false;
		}
	}
</script>

<svelte:head>
	<title>{data.profile.username} · flightlesskiwi</title>
	<meta
		name="description"
		content={`Benchmarks uploaded by ${data.profile.username} on flightlesskiwi.`}
	/>
</svelte:head>

<div class="-mb-8 flex h-[calc(100%+2rem)] min-h-0 flex-col gap-6">
	<header class="flex items-center gap-4">
		<div class="flex size-24 shrink-0 items-center justify-center rounded-2xl bg-muted/40">
			<Blobatar name={data.profile.username} size={80} animate="always" reactOnClick />
		</div>
		<div class="min-w-0">
			<p class="text-sm font-medium text-primary">Profile</p>
			<h1 class="truncate text-3xl font-bold tracking-tight">{data.profile.username}</h1>
		</div>
	</header>

	<section aria-labelledby="profile-benchmarks-heading" class="contents">
		<div>
			<h2 id="profile-benchmarks-heading" class="text-xl font-semibold">Benchmark uploads</h2>
			<p class="text-sm text-muted-foreground">
				Public benchmark results shared by {data.profile.username}.
			</p>
		</div>

		{#if benchmarks.length > 0}
			{#key data.profile.username}
				<BenchmarkList
					{benchmarks}
					onLoadMore={loadMore}
					{hasMore}
					viewportLabel={`${data.profile.username}'s benchmarks`}
				/>
			{/key}
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
				<p class="mt-1 text-sm text-muted-foreground">
					Uploads from {data.profile.username} will appear here.
				</p>
			</div>
		{/if}
	</section>
</div>
