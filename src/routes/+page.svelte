<script lang="ts">
	import Game from '$lib/components/game.svelte';
	import GameSearch from '$lib/components/game-search.svelte';

	let selectedGameId = $state<number | null>(null);

	function handleGameSelected(gameId: number) {
		selectedGameId = gameId;
	}
</script>

<svelte:head>
	<title>Home · flightlesskiwi</title>
</svelte:head>

<GameSearch onSelected={handleGameSelected} />
{#if selectedGameId}
	{#key selectedGameId}
		<Game gameId={selectedGameId} />
	{/key}
{/if}
