<script lang="ts">
	import FileIcon from '@lucide/svelte/icons/file-chart-column';
	import XIcon from '@lucide/svelte/icons/x';
	import {
		MAX_BENCHMARK_FILES,
		MAX_BENCHMARK_FILE_SIZE,
		MAX_BENCHMARK_TOTAL_SIZE,
		formatFileSize
	} from '$lib/benchmark';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';

	interface Props {
		files?: FileList;
		existingFiles?: ExistingBenchmarkFile[];
		removedFileIds?: string[];
		disabled?: boolean;
		id?: string;
		name?: string;
	}

	interface ExistingBenchmarkFile {
		id: string;
		originalName: string;
		size: number;
	}

	interface DisplayBenchmarkFile {
		key: string;
		name: string;
		size: number;
		existingId?: string;
		pendingIndex?: number;
	}

	const MAX_DISPLAY_BASENAME_LENGTH = 8;

	let {
		files = $bindable(),
		existingFiles = [],
		removedFileIds = $bindable([]),
		disabled = false,
		id = 'benchmark-files',
		name = 'files'
	}: Props = $props();

	let displayedFiles = $derived.by(() => {
		const removedIds = new Set(removedFileIds);
		return [
			...existingFiles
				.filter((file) => !removedIds.has(file.id))
				.map((file): DisplayBenchmarkFile => ({
					key: `existing-${file.id}`,
					name: file.originalName,
					size: file.size,
					existingId: file.id
				})),
			...Array.from(files ?? []).map((file, index): DisplayBenchmarkFile => ({
				key: `pending-${file.name}-${file.size}-${file.lastModified}-${index}`,
				name: file.name,
				size: file.size,
				pendingIndex: index
			}))
		];
	});
	let retainedExistingFileCount = $derived(
		existingFiles.filter((file) => !removedFileIds.includes(file.id)).length
	);

	function removeFile(indexToRemove: number) {
		if (!files) return;

		const remainingFiles = new DataTransfer();
		for (const [index, file] of Array.from(files).entries()) {
			if (index !== indexToRemove) remainingFiles.items.add(file);
		}
		files = remainingFiles.files;
	}

	function removeDisplayedFile(file: DisplayBenchmarkFile) {
		if (file.existingId !== undefined) {
			if (!removedFileIds.includes(file.existingId)) {
				removedFileIds = [...removedFileIds, file.existingId];
			}
			return;
		}
		if (file.pendingIndex !== undefined) removeFile(file.pendingIndex);
	}

	function displayFileName(fileName: string) {
		const extensionStart = fileName.lastIndexOf('.');
		const hasExtension = extensionStart > 0;
		const basename = hasExtension ? fileName.slice(0, extensionStart) : fileName;
		const extension = hasExtension ? fileName.slice(extensionStart) : '';

		if (basename.length <= MAX_DISPLAY_BASENAME_LENGTH) {
			return { basename, extension, truncated: false };
		}

		return {
			basename: basename.slice(0, MAX_DISPLAY_BASENAME_LENGTH),
			extension,
			truncated: true
		};
	}
</script>

<Field.Field>
	<Field.Label for={id}>Benchmark files</Field.Label>
	<div class="rounded-lg border border-dashed p-4">
		<div class="mb-3 flex items-start gap-3">
			<div class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
				<FileIcon class="size-5" />
			</div>
			<div>
				<p class="text-sm font-medium">MangoHud or CapFrameX output</p>
				<p class="text-sm text-muted-foreground">
					CSV or JSON files are expected. They will be kept raw for later processing.
				</p>
			</div>
		</div>
		<Input
			{id}
			{name}
			type="file"
			accept=".csv,.json,text/csv,text/json,application/json"
			multiple
			required={retainedExistingFileCount === 0}
			{disabled}
			bind:files
		/>
		{#each removedFileIds as removedFileId (removedFileId)}
			<input type="hidden" name="removed_file_ids" value={removedFileId} />
		{/each}
		{#if displayedFiles.length}
			<Tooltip.Provider>
				<ul class="mt-3 flex flex-wrap gap-2" aria-label="Benchmark files">
					{#each displayedFiles as file (file.key)}
						{@const displayedName = displayFileName(file.name)}
						<li
							class="relative flex size-24 shrink-0 flex-col items-center justify-center rounded-md border bg-muted/30 p-2 text-center"
						>
							<Button
								type="button"
								variant="ghost"
								size="icon-xs"
								class="absolute top-1 right-1"
								aria-label={`Remove ${file.name}`}
								onclick={() => removeDisplayedFile(file)}
								{disabled}
							>
								<XIcon />
							</Button>
							<FileIcon class="mb-1 size-6 text-muted-foreground" />
							<Tooltip.Root>
								<Tooltip.Trigger>
									{#snippet child({ props })}
										<button
											type="button"
											class="flex max-w-full cursor-default items-baseline text-xs font-medium outline-none"
											{...props}
										>
											<span class="overflow-hidden whitespace-nowrap">{displayedName.basename}</span
											>
											{#if displayedName.truncated}
												<span class="shrink-0 text-muted-foreground">...</span>
											{/if}
											<span class="shrink-0">{displayedName.extension}</span>
										</button>
									{/snippet}
								</Tooltip.Trigger>
								<Tooltip.Content side="bottom" sideOffset={6} class="break-all">
									{file.name}
								</Tooltip.Content>
							</Tooltip.Root>
							<p class="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
						</li>
					{/each}
				</ul>
			</Tooltip.Provider>
		{/if}
	</div>
	<Field.Description>
		Up to {MAX_BENCHMARK_FILES} files, {formatFileSize(MAX_BENCHMARK_FILE_SIZE)} each and {formatFileSize(
			MAX_BENCHMARK_TOTAL_SIZE
		)} total.
	</Field.Description>
</Field.Field>
