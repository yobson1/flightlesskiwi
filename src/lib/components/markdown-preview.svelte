<script lang="ts">
	import SvelteMarkdown, {
		buildUnsupportedHTML,
		defaultRenderers
	} from '@humanspeak/svelte-markdown';
	import * as Dialog from '$lib/components/ui/dialog/index.js';

	interface Props {
		source: string;
		open?: boolean;
		title?: string;
	}

	let { source, open = $bindable(false), title = 'Description preview' }: Props = $props();

	const markdownRenderers = {
		...defaultRenderers,
		html: buildUnsupportedHTML()
	};
</script>

<Dialog.Root bind:open>
	<Dialog.Content
		class="flex max-h-[min(88dvh,64rem)] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl"
	>
		<Dialog.Header class="shrink-0 border-b px-6 py-4 pr-12">
			<Dialog.Title>{title}</Dialog.Title>
			<Dialog.Description>Rendered as GitHub Flavored Markdown.</Dialog.Description>
		</Dialog.Header>

		<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 sm:p-8">
			{#if source.trim()}
				<article class="wrap-break-words prose prose-sm max-w-none dark:prose-invert">
					<SvelteMarkdown {source} options={{ gfm: true }} renderers={markdownRenderers} />
				</article>
			{:else}
				<p class="text-sm text-muted-foreground">Nothing to preview yet.</p>
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>
