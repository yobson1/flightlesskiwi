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

<div class="layout">
	<header>
		<nav>
			<Nav />
		</nav>
	</header>
	<main class="main-container">
		<div class="content">
			{@render children?.()}
		</div>
	</main>
	<footer>
		<p>&copy; 2025 Flightless Kiwi</p>
	</footer>
</div>

<style>
	.layout {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
	}

	header {
		padding: 1rem;
		width: 100%;
		display: flex;
		justify-content: center;
	}

	nav {
		max-width: 1200px;
		min-width: 320px;
		width: 80%;
	}

	.main-container {
		flex: 1;
		display: flex;
		justify-content: center;
		padding: 2rem 1rem;
	}

	.content {
		max-width: 1200px;
		min-width: 320px;
		width: 80%;
	}

	footer {
		padding: 1rem;
		width: 100%;
		text-align: center;
	}
</style>
