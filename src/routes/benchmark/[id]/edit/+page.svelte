<script lang="ts">
	import BenchmarkForm from '$lib/components/benchmark-form.svelte';
	import type { PageProps } from './$types';

	let { form, data }: PageProps = $props();
</script>

<BenchmarkForm
	mode="edit"
	{form}
	turnstileSiteKey={data.turnstileSiteKey}
	initialValues={{
		gameId: data.benchmark.gameId,
		title: data.benchmark.title,
		description: data.benchmark.description
	}}
	existingFiles={data.files}
/>
