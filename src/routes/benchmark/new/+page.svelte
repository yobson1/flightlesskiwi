<script lang="ts">
	import BenchmarkForm from '$lib/components/benchmark-form.svelte';
	import type { PageProps } from './$types';

	let { form, data }: PageProps = $props();
</script>

<BenchmarkForm mode="create" {form} turnstileSiteKey={data.turnstileSiteKey} />
