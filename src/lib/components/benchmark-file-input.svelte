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

	interface Props {
		files?: FileList;
		disabled?: boolean;
		id?: string;
		name?: string;
	}

	let {
		files = $bindable(),
		disabled = false,
		id = 'benchmark-files',
		name = 'files'
	}: Props = $props();

	function removeFile(indexToRemove: number) {
		if (!files) return;

		const remainingFiles = new DataTransfer();
		for (const [index, file] of Array.from(files).entries()) {
			if (index !== indexToRemove) remainingFiles.items.add(file);
		}
		files = remainingFiles.files;
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
				<p class="text-sm font-medium">MangoHud or PresentMon output</p>
				<p class="text-sm text-muted-foreground">
					CSV or text files are expected. They will be kept raw for later processing.
				</p>
			</div>
		</div>
		<Input
			{id}
			{name}
			type="file"
			accept=".csv,.txt,text/csv,text/plain"
			multiple
			required
			{disabled}
			bind:files
		/>
		{#if files?.length}
			<ul
				class="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5"
				aria-label="Selected benchmark files"
			>
				{#each Array.from(files) as file, index (`${file.name}-${file.size}-${file.lastModified}-${index}`)}
					<li
						class="relative flex min-h-24 min-w-0 flex-col items-center justify-center rounded-md border bg-muted/30 p-2 text-center"
					>
						<Button
							type="button"
							variant="ghost"
							size="icon-xs"
							class="absolute top-1 right-1"
							aria-label={`Remove ${file.name}`}
							onclick={() => removeFile(index)}
							{disabled}
						>
							<XIcon />
						</Button>
						<FileIcon class="mb-1 size-6 text-muted-foreground" />
						<p class="w-full truncate text-xs font-medium" title={file.name}>
							{file.name}
						</p>
						<p class="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
	<Field.Description>
		Up to {MAX_BENCHMARK_FILES} files, {formatFileSize(MAX_BENCHMARK_FILE_SIZE)} each and {formatFileSize(
			MAX_BENCHMARK_TOTAL_SIZE
		)} total.
	</Field.Description>
</Field.Field>
