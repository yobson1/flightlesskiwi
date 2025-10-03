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

<div class="flex min-h-screen flex-col">
	<header class="flex w-full justify-center">
		<nav class="flex w-4/5 max-w-screen-xl min-w-80 justify-between rounded-md py-1">
			<a href="/" class="flex items-center gap-2">
				<img src={favicon} alt="Home" class="h-8 w-8" />
				<span class="font-semibold">flightlesskiwi</span>
			</a>
			<Nav />
		</nav>
	</header>
	<main class="flex flex-1 justify-center px-4 py-8">
		<div class="w-4/5 max-w-screen-xl min-w-80">
			{@render children?.()}
		</div>
	</main>
	<footer class="w-full p-4 text-center">
		<p>&copy; 2025</p>
	</footer>
</div>
