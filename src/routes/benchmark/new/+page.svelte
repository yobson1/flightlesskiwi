<script lang="ts">
	import LoaderIcon from '@lucide/svelte/icons/loader-circle';
	import ScanEyeIcon from '@lucide/svelte/icons/scan-eye';
	import UploadIcon from '@lucide/svelte/icons/upload';
	import { enhance } from '$app/forms';
	import { MAX_BENCHMARK_DESCRIPTION_LENGTH, MAX_BENCHMARK_TITLE_LENGTH } from '$lib/benchmark';
	import BenchmarkFileInput from '$lib/components/benchmark-file-input.svelte';
	import GameInline from '$lib/components/game-inline.svelte';
	import GameSearch from '$lib/components/game-search.svelte';
	import MarkdownPreview from '$lib/components/markdown-preview.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { getMessage } from '$lib/utils';
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();

	const initialValues = untrack(() => getSubmittedValues(form));
	let selectedGameId = $state<number | null>(initialValues?.gameId ?? null);
	let selectedFiles = $state<FileList>();
	let submitting = $state(false);
	let gameSearchKey = $state(0);
	let description = $state(initialValues?.description ?? '');
	let descriptionPreviewOpen = $state(false);

	const uploadSubmit: SubmitFunction = () => {
		submitting = true;

		return async ({ result, update }) => {
			submitting = false;
			if (result.type === 'failure') {
				toast.error(getMessage(result.data, 'Unable to upload benchmark'));
				await update({ reset: false });
				return;
			}
			if (result.type === 'error') {
				toast.error('Unable to upload benchmark');
				await update({ reset: false });
				return;
			}
			if (result.type === 'success') {
				toast.success(getMessage(result.data, 'Benchmark uploaded'));
				selectedGameId = null;
				selectedFiles = undefined;
				description = '';
				gameSearchKey++;
			}
			await update({ reset: result.type === 'success' });
		};
	};

	function selectGame(gameId: number) {
		selectedGameId = gameId;
	}

	function getSubmittedValues(value: unknown):
		| {
				gameId: number | null;
				title: string;
				description: string;
		  }
		| undefined {
		if (
			typeof value !== 'object' ||
			value === null ||
			!('values' in value) ||
			typeof value.values !== 'object' ||
			value.values === null
		) {
			return undefined;
		}
		const values = value.values as Record<string, unknown>;
		if (
			(values.gameId !== null && typeof values.gameId !== 'number') ||
			typeof values.title !== 'string' ||
			typeof values.description !== 'string'
		) {
			return undefined;
		}
		return {
			gameId: values.gameId,
			title: values.title,
			description: values.description
		};
	}
</script>

<svelte:head>
	<title>Upload benchmark · flightlesskiwi</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<div>
		<p class="text-sm font-medium text-primary">Share your results</p>
		<h1 class="text-3xl font-bold tracking-tight">Upload benchmark</h1>
		<p class="mt-2 text-muted-foreground">
			Add your MangoHud and/or PresentMon output and describe the run
		</p>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>Benchmark details</Card.Title>
			<Card.Description>
				Choose the game and upload the raw files produced during the same benchmark run.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<form method="POST" enctype="multipart/form-data" use:enhance={uploadSubmit}>
				<Field.Group>
					<Field.Field
						data-invalid={form?.message && !form?.benchmarkId && selectedGameId === null}
					>
						<Field.Label for="benchmark-game-search">Game</Field.Label>
						{#key gameSearchKey}
							<GameSearch onSelected={selectGame} inputId="benchmark-game-search" />
						{/key}
						<input type="hidden" name="game_id" value={selectedGameId ?? ''} />
						{#if selectedGameId !== null}
							<GameInline gameId={selectedGameId} />
						{:else}
							<Field.Description>Select a game from the search results.</Field.Description>
						{/if}
					</Field.Field>

					<Field.Field>
						<Field.Label for="benchmark-title">Title</Field.Label>
						<Input
							id="benchmark-title"
							name="title"
							value={getSubmittedValues(form)?.title ?? ''}
							maxlength={MAX_BENCHMARK_TITLE_LENGTH}
							placeholder="e.g. Steam Deck OLED · High preset"
							required
						/>
						<Field.Description>
							A short, descriptive title. Maximum {MAX_BENCHMARK_TITLE_LENGTH} characters.
						</Field.Description>
					</Field.Field>

					<Field.Field>
						<Field.Label for="benchmark-description">Description</Field.Label>
						<Textarea
							id="benchmark-description"
							name="description"
							bind:value={description}
							maxlength={MAX_BENCHMARK_DESCRIPTION_LENGTH}
							rows={5}
							placeholder="Optional notes about settings, hardware, or the run..."
						/>
						<Field.Description>
							Optional. GitHub Flavored Markdown is supported. Maximum {MAX_BENCHMARK_DESCRIPTION_LENGTH.toLocaleString()}
							characters.
						</Field.Description>
					</Field.Field>

					<BenchmarkFileInput bind:files={selectedFiles} disabled={submitting} />

					{#if form?.message && !form?.benchmarkId}
						<Field.Error>{form.message}</Field.Error>
					{:else if form?.benchmarkId}
						<p class="text-sm text-emerald-600 dark:text-emerald-400" role="status">
							Benchmark uploaded successfully.
						</p>
					{/if}

					<div class="flex justify-end gap-2">
						<Button
							type="button"
							variant="outline"
							size="lg"
							onclick={() => (descriptionPreviewOpen = true)}
						>
							<ScanEyeIcon />
							Preview
						</Button>
						<Button type="submit" size="lg" disabled={submitting}>
							{#if submitting}
								<LoaderIcon class="animate-spin" />
								Uploading…
							{:else}
								<UploadIcon />
								Upload benchmark
							{/if}
						</Button>
					</div>
				</Field.Group>
			</form>
		</Card.Content>
	</Card.Root>
</div>

<MarkdownPreview bind:open={descriptionPreviewOpen} source={description} />
