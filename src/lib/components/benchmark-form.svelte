<script lang="ts">
	import LoaderIcon from '@lucide/svelte/icons/loader-circle';
	import SaveIcon from '@lucide/svelte/icons/save';
	import ScanEyeIcon from '@lucide/svelte/icons/scan-eye';
	import UploadIcon from '@lucide/svelte/icons/upload';
	import { enhance, type SubmitFunction } from '$app/forms';
	import { MAX_BENCHMARK_DESCRIPTION_LENGTH, MAX_BENCHMARK_TITLE_LENGTH } from '#lib/benchmark.js';
	import BenchmarkFileInput from '#lib/components/benchmark-file-input.svelte';
	import GameInline from '#lib/components/game-inline.svelte';
	import GameSearch from '#lib/components/game-search.svelte';
	import MarkdownPreview from '#lib/components/markdown-preview.svelte';
	import Turnstile from '#lib/components/turnstile.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { getMessage } from '#lib/utils.js';
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import * as v from 'valibot';

	const submittedValuesSchema = v.object({
		gameId: v.nullable(v.number()),
		title: v.string(),
		description: v.string()
	});
	const formStateSchema = v.object({
		message: v.optional(v.string()),
		benchmarkId: v.optional(v.string()),
		values: v.optional(submittedValuesSchema),
		removedFileIds: v.optional(v.array(v.string()))
	});

	type Mode = 'create' | 'edit';

	interface InitialValues {
		gameId: number | null;
		title: string;
		description: string;
	}
	interface ExistingBenchmarkFile {
		id: string;
		originalName: string;
		size: number;
	}

	interface Props {
		mode: Mode;
		form?: unknown;
		turnstileSiteKey: string | null;
		initialValues?: InitialValues;
		existingFiles?: ExistingBenchmarkFile[];
	}

	let {
		mode,
		form,
		turnstileSiteKey,
		initialValues = { gameId: null, title: '', description: '' },
		existingFiles = []
	}: Props = $props();

	let parsedForm = $derived(parseFormState(form));
	const initialForm = untrack(() => parseFormState(form));
	const initialBenchmarkValues = untrack(() => initialValues);
	let selectedGameId = $state(initialForm?.values?.gameId ?? initialBenchmarkValues.gameId);
	let selectedFiles = $state<FileList>();
	let removedFileIds = $state(initialForm?.removedFileIds ?? []);
	let submitting = $state(false);
	let gameSearchKey = $state(0);
	let description = $state(initialForm?.values?.description ?? initialBenchmarkValues.description);
	let descriptionPreviewOpen = $state(false);
	let turnstileToken = $state('');
	let turnstileInteractive = $state(false);
	let resetTurnstile: (() => void) | null = null;

	const isCreate = untrack(() => mode === 'create');
	const pageTitle = isCreate ? 'Upload benchmark' : 'Edit benchmark';
	const eyebrow = isCreate ? 'Share your results' : 'Update your results';
	const intro = isCreate
		? 'Add your MangoHud and/or CapFrameX output and describe the run.'
		: 'Update the benchmark details and manage its MangoHud and CapFrameX output.';
	const cardDescription = isCreate
		? 'Choose the game and upload the raw files produced during the same benchmark run.'
		: 'Change the game or details, add new raw files, or remove existing uploads.';

	const benchmarkSubmit: SubmitFunction = () => {
		submitting = true;

		return async ({ result, update }) => {
			submitting = false;
			resetTurnstile?.();
			if (result.type === 'failure') {
				toast.error(
					getMessage(
						result.data,
						isCreate ? 'Unable to upload benchmark' : 'Unable to update benchmark'
					)
				);
				await update({ reset: false });
				return;
			}
			if (result.type === 'error') {
				toast.error(isCreate ? 'Unable to upload benchmark' : 'Unable to update benchmark');
				await update({ reset: false });
				return;
			}
			if (result.type === 'success') {
				toast.success(getMessage(result.data, 'Benchmark uploaded'));
				selectedGameId = null;
				selectedFiles = undefined;
				removedFileIds = [];
				description = '';
				gameSearchKey++;
			} else if (result.type === 'redirect') {
				toast.success('Benchmark updated');
			}
			await update({ reset: result.type === 'success' });
		};
	};

	function selectGame(gameId: number) {
		selectedGameId = gameId;
	}

	function parseFormState(value: unknown) {
		const result = v.safeParse(formStateSchema, value);
		return result.success ? result.output : undefined;
	}
</script>

<svelte:head>
	<title>{pageTitle} · flightlesskiwi</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<div>
		<p class="text-sm font-medium text-primary">{eyebrow}</p>
		<h1 class="text-3xl font-bold tracking-tight">{pageTitle}</h1>
		<p class="mt-2 text-muted-foreground">
			{intro}
			Before recording,
			<a
				href="/help#configure-your-tool"
				class="font-medium text-foreground underline underline-offset-4"
			>
				check the recommended capture settings
			</a>.
		</p>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>Benchmark details</Card.Title>
			<Card.Description>{cardDescription}</Card.Description>
		</Card.Header>
		<Card.Content>
			<form method="POST" enctype="multipart/form-data" use:enhance={benchmarkSubmit}>
				<Field.Group>
					<Field.Field
						data-invalid={parsedForm?.message && !parsedForm.benchmarkId && selectedGameId === null}
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
							value={parsedForm?.values?.title ?? initialBenchmarkValues.title}
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

					<BenchmarkFileInput
						bind:files={selectedFiles}
						bind:removedFileIds
						{existingFiles}
						disabled={submitting}
					/>

					{#if parsedForm?.message && !parsedForm.benchmarkId}
						<Field.Error>{parsedForm.message}</Field.Error>
					{:else if parsedForm?.benchmarkId}
						<p class="text-sm text-emerald-600 dark:text-emerald-400" role="status">
							Benchmark uploaded successfully.
						</p>
					{/if}

					<div class="relative flex items-center gap-4">
						<div
							class:absolute={!turnstileInteractive}
							class:top-0={!turnstileInteractive}
							class:left-0={!turnstileInteractive}
							aria-hidden={!turnstileInteractive}
						>
							<Turnstile
								siteKey={turnstileSiteKey}
								align="start"
								onToken={(token) => (turnstileToken = token)}
								onInteractiveChange={(interactive) => (turnstileInteractive = interactive)}
								onResetReady={(reset) => (resetTurnstile = reset)}
							/>
						</div>
						<div class="ml-auto flex shrink-0 gap-2">
							<Button
								type="button"
								variant="outline"
								size="lg"
								onclick={() => (descriptionPreviewOpen = true)}><ScanEyeIcon />Preview</Button
							>

							<Button
								type="submit"
								size="lg"
								disabled={submitting || (turnstileSiteKey !== null && !turnstileToken)}
							>
								{#if submitting}
									<LoaderIcon class="animate-spin" />
									{isCreate ? 'Uploading…' : 'Saving…'}
								{:else if isCreate}
									<UploadIcon />
									Upload benchmark
								{:else}
									<SaveIcon />
									Save changes
								{/if}
							</Button>
						</div>
					</div>
				</Field.Group>
			</form>
		</Card.Content>
	</Card.Root>
</div>

<MarkdownPreview bind:open={descriptionPreviewOpen} source={description} />
