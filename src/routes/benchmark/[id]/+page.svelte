<script lang="ts">
	import DownloadIcon from '@lucide/svelte/icons/download';
	import ExpandIcon from '@lucide/svelte/icons/expand';
	import LoaderIcon from '@lucide/svelte/icons/loader-circle';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { enhance, type SubmitFunction } from '$app/forms';
	import { resolve } from '$app/paths';
	import SvelteMarkdown, {
		buildUnsupportedHTML,
		defaultRenderers
	} from '@humanspeak/svelte-markdown';
	import BenchmarkCharts from '#lib/components/benchmark-charts.svelte';
	import BenchmarkRunCard from '#lib/components/benchmark-run-card.svelte';
	import Game from '#lib/components/game.svelte';
	import MarkdownPreview from '#lib/components/markdown-preview.svelte';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { constructImageUrl } from '#lib/igdb.js';
	import { toast } from 'svelte-sonner';
	import { getMessage } from '#lib/utils.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let deleting = $state(false);
	let descriptionPreviewOpen = $state(false);
	let previewDescription = $derived(
		`${data.benchmark.gameName ?? 'Game'} benchmark shared by ${data.benchmark.username}, with ${data.runs.length} recorded ${data.runs.length === 1 ? 'run' : 'runs'}.`
	);

	let previewImage = $derived(
		data.benchmark.coverImgId ? constructImageUrl(data.benchmark.coverImgId, 'cover_big_2x') : null
	);

	let previewImageAlt = $derived(
		data.benchmark.gameName ? `${data.benchmark.gameName} cover art` : 'Game cover art'
	);

	const dateFormatter = new Intl.DateTimeFormat('en', { dateStyle: 'long', timeZone: 'UTC' });
	const markdownRenderers = { ...defaultRenderers, html: buildUnsupportedHTML() };

	const deleteSubmit: SubmitFunction = () => {
		deleting = true;

		return async ({ result, update }) => {
			deleting = false;
			if (result.type === 'failure') {
				toast.error(getMessage(result.data, 'Unable to delete benchmark'));
			} else if (result.type === 'error') {
				toast.error('Unable to delete benchmark');
			}
			await update({ reset: false });
		};
	};
</script>

<svelte:head>
	<title>{data.benchmark.title} · flightlesskiwi</title>
	<meta name="description" content={previewDescription} />
	<link rel="canonical" href={data.canonicalUrl} />

	<meta property="og:title" content={data.benchmark.title} />
	<meta property="og:description" content={previewDescription} />
	<meta property="og:type" content="website" />
	<meta property="og:url" content={data.canonicalUrl} />
	<meta property="og:site_name" content="flightlesskiwi" />
	<meta property="og:locale" content="en_GB" />

	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content={data.benchmark.title} />
	<meta name="twitter:description" content={previewDescription} />

	{#if previewImage}
		<meta property="og:image" content={previewImage} />
		<meta property="og:image:type" content="image/webp" />
		<meta property="og:image:width" content="528" />
		<meta property="og:image:height" content="704" />
		<meta property="og:image:alt" content={previewImageAlt} />
		<meta name="twitter:image" content={previewImage} />
		<meta name="twitter:image:alt" content={previewImageAlt} />
	{/if}
</svelte:head>

<div class="grid items-stretch gap-8 lg:grid-cols-2">
	<div class="min-w-0">
		<Game gameId={data.benchmark.gameId} />
	</div>

	<div class="relative min-w-0">
		<article
			class="min-w-0 lg:absolute lg:inset-0 lg:flex lg:min-h-0 lg:flex-col lg:overflow-hidden lg:border-l lg:pl-8"
		>
			<div class="shrink-0">
				<div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
					<div class="min-w-0">
						<p class="text-sm font-medium text-primary">Benchmark result</p>
						<h1 class="text-3xl font-bold tracking-tight">{data.benchmark.title}</h1>
						<p class="mt-2 text-sm text-muted-foreground">
							Uploaded by
							<a
								href={resolve('/profile/[username]', { username: data.benchmark.username })}
								class="font-medium hover:text-foreground hover:underline focus-visible:rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
							>
								{data.benchmark.username}
							</a>
							on
							<time datetime={data.benchmark.createdAt.toISOString()}>
								{dateFormatter.format(data.benchmark.createdAt)}
							</time>
						</p>
					</div>
					<div class="flex shrink-0 gap-2">
						<Button
							href={resolve('/benchmark/[id]/download', { id: data.benchmark.id })}
							variant="outline"
							download
						>
							<DownloadIcon />
							Download
						</Button>
						{#if data.canEdit}
							<Button
								href={resolve('/benchmark/[id]/edit', { id: data.benchmark.id })}
								variant="outline"
							>
								<PencilIcon />
								Edit
							</Button>
						{/if}
						{#if data.canDelete}
							<AlertDialog.Root>
								<AlertDialog.Trigger class="inline-flex">
									{#snippet child({ props })}
										<Button variant="destructive" {...props}>
											<Trash2Icon />
											Delete
										</Button>
									{/snippet}
								</AlertDialog.Trigger>
								<AlertDialog.Content>
									<form method="POST" action="?/delete" use:enhance={deleteSubmit}>
										<div class="grid gap-4">
											<AlertDialog.Header>
												<AlertDialog.Title>Delete this benchmark?</AlertDialog.Title>
												<AlertDialog.Description>
													This permanently deletes the benchmark and its uploaded files. This action
													cannot be undone.
												</AlertDialog.Description>
											</AlertDialog.Header>
											<AlertDialog.Footer>
												<AlertDialog.Cancel type="button">Cancel</AlertDialog.Cancel>
												<Button type="submit" variant="destructive" disabled={deleting}>
													{#if deleting}
														<LoaderIcon class="animate-spin" />
														Deleting…
													{:else}
														Delete benchmark
													{/if}
												</Button>
											</AlertDialog.Footer>
										</div>
									</form>
								</AlertDialog.Content>
							</AlertDialog.Root>
						{/if}
					</div>
				</div>
			</div>

			{#if data.benchmark.description}
				<div class="relative mt-6 lg:min-h-0 lg:flex-1">
					<Button
						variant="outline"
						size="icon-sm"
						class="absolute top-0 right-3"
						aria-label="Open description preview"
						onclick={() => (descriptionPreviewOpen = true)}><ExpandIcon /></Button
					>

					<div
						class="wrap-break-words prose prose-sm max-w-none pr-12 lg:h-full lg:overflow-y-auto lg:overscroll-contain lg:pr-14 dark:prose-invert"
					>
						<SvelteMarkdown
							source={data.benchmark.description}
							options={{ gfm: true }}
							renderers={markdownRenderers}
						/>
					</div>
				</div>
			{/if}
		</article>
	</div>
</div>

{#if data.benchmark.description}
	<MarkdownPreview
		bind:open={descriptionPreviewOpen}
		source={data.benchmark.description}
		title={`${data.benchmark.title} description`}
	/>
{/if}

<section class="mt-4" aria-label="Included benchmark runs">
	<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
		{#each data.runs as run (run.id)}
			<BenchmarkRunCard {run} />
		{/each}
	</div>
</section>

<BenchmarkCharts benchmarkId={data.benchmark.id} runs={data.runs} />
