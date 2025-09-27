<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { ModeWatcher } from 'mode-watcher';
	import Nav from '$lib/components/Nav.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>
<ModeWatcher />

<header>
	<Nav />
</header>
<main>
	{@render children?.()}
</main>
<footer>
	<p>&copy; 2025 Flightless Kiwi</p>
</footer>
