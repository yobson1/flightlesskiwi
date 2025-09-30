<script lang="ts">
	import Game from '$lib/components/Game.svelte';
	import GameSearch from '$lib/components/GameSearch.svelte';

	let selectedGameId = $state<number | null>(null);

	function handleGameSelected(gameId: number) {
		selectedGameId = gameId;
	}
</script>

<GameSearch onSelected={handleGameSelected} />
{#if selectedGameId}
	{#key selectedGameId}
		<Game gameId={selectedGameId} />
	{/key}
{/if}
