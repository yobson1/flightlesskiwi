<!-- routes/game/[id]/+page.svelte -->
<script lang="ts">
	import SimpleIconsGogdotcom from '~icons/simple-icons/gogdotcom';
	import SimpleIconsSteam from '~icons/simple-icons/steam';
	import SimpleIconsItchdotio from '~icons/simple-icons/itchdotio';
	import SimpleIconsEpicgames from '~icons/simple-icons/epicgames';
	import { GameSource } from '$lib/enums/igdb';
	import { Button } from '$lib/components/ui/button';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<img src={data.game.cover_url} alt={data.game.name} />
{#each data.game.platforms as platform (platform)}
	<Button variant="outline" size="icon" href={platform.url}>
		{#if platform.game_source === GameSource.gog}
			<SimpleIconsGogdotcom />
		{/if}
		{#if platform.game_source === GameSource.steam}
			<SimpleIconsSteam />
		{/if}
		{#if platform.game_source === GameSource.itch_io}
			<SimpleIconsItchdotio />
		{/if}
		{#if platform.game_source === GameSource.epic_game_store}
			<SimpleIconsEpicgames />
		{/if}
	</Button>
{/each}

<style>
</style>
