<script lang="ts">
	import { replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page as appPage } from '$app/state';
	import {
		BenchmarkPageCache,
		normalizeBenchmarkPage,
		type BenchmarkPagination,
		type LoadedBenchmarkPage
	} from '$lib/client/benchmark-page-cache.svelte';
	import BenchmarkList from '$lib/components/benchmark-list.svelte';
	import Blobatar from '$lib/components/blobatar.svelte';
	import {
		benchmarkPageResponseSchema,
		type BenchmarkPageResponse
	} from '$lib/types/benchmark-api';
	import { onDestroy, untrack } from 'svelte';
	import { SvelteURL, SvelteURLSearchParams } from 'svelte/reactivity';
	import type { PageProps } from './$types';
	import * as v from 'valibot';

	let { data }: PageProps = $props();
	const initialPage = untrack(() => data);
	const initialPagination = requirePagination(initialPage.pagination);
	let loadedUsername = initialPage.profile.username;
	let benchmarkListVersion = $state(0);
	let listInitialPage = $state(initialPagination.page);
	const benchmarkPages = new BenchmarkPageCache(
		{
			benchmarks: [...initialPage.benchmarks],
			pagination: initialPagination
		},
		fetchProfileBenchmarkPage
	);
	onDestroy(() => benchmarkPages.destroy());

	$effect.pre(() => {
		const username = data.profile.username;
		if (username === loadedUsername) return;

		loadedUsername = username;
		benchmarkListVersion += 1;
		const pagination = requirePagination(data.pagination);
		listInitialPage = pagination.page;
		benchmarkPages.reset(
			{
				benchmarks: [...data.benchmarks],
				pagination
			},
			fetchProfileBenchmarkPage
		);
	});

	async function fetchProfileBenchmarkPage(
		pageNumber: number,
		signal: AbortSignal
	): Promise<LoadedBenchmarkPage> {
		const username = data.profile.username;
		const searchParams = new SvelteURLSearchParams({ page: pageNumber.toString() });
		const endpoint = resolve('/api/profiles/[username]/benchmarks', { username });
		const response = await fetch(`${endpoint}?${searchParams}`, { signal });
		if (!response.ok) throw new Error('Unable to load benchmark page');
		const result = v.safeParse(benchmarkPageResponseSchema, await response.json());
		if (!result.success) throw new Error('Invalid benchmark page response');
		return normalizeBenchmarkPage(result.output);
	}

	function handlePageChange(pageNumber: number) {
		const url = new SvelteURL(window.location.href);
		if (pageNumber === 1) url.searchParams.delete('page');
		else url.searchParams.set('page', pageNumber.toString());
		// SAFETY: this is the current application pathname with only its query changed.
		const href = resolve(`${url.pathname}${url.search}` as '/');
		replaceState(href, appPage.state);
	}

	function requirePagination(pagination: BenchmarkPageResponse['pagination']): BenchmarkPagination {
		if (pagination === null) throw new Error('Missing benchmark pagination metadata');
		return pagination;
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

		{#if benchmarkPages.pagination.totalCount > 0}
			{#key `${data.profile.username}:${benchmarkListVersion}`}
				<BenchmarkList
					benchmarks={[]}
					pagination={{
						benchmarks: benchmarkPages.benchmarks,
						indices: benchmarkPages.indices,
						initialPage: listInitialPage,
						pageSize: benchmarkPages.pagination.pageSize,
						totalCount: benchmarkPages.pagination.totalCount,
						totalPages: benchmarkPages.pagination.totalPages,
						loadPageWindow: (pageNumber) => benchmarkPages.loadPageWindow(pageNumber),
						onPageChange: handlePageChange
					}}
					viewportLabel={`${data.profile.username}'s benchmarks`}
				/>
			{/key}
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
