<!-- routes/game/[id]/+page.svelte -->
<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<pre>{JSON.stringify(data.game, null, 2)}</pre>

<style>
	pre {
		background: #f4f4f4;
		padding: 1rem;
		border-radius: 4px;
		overflow-x: auto;
		font-family: 'Courier New', monospace;
		white-space: pre-wrap;
		word-wrap: break-word;
	}
</style>
