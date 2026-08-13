<script lang="ts">
	import { resolve } from '$app/paths';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import Search from '$lib/components/search.svelte';
	import { constructImageUrl } from '$lib/igdb';
	import { gameSearchResultsSchema, type GameSearchResult } from '$lib/types/game';
	import * as v from 'valibot';

	const gameSearchErrorSchema = v.object({ error: v.string() });

	interface Props {
		onSelected?: (gameId: number, game: GameSearchResult) => void;
		noParent?: boolean;
		inputId?: string;
	}

	let { onSelected, noParent = false, inputId }: Props = $props();
	let imageLoadingStates = $state<Record<number, boolean>>({});

	async function searchGames(query: string, signal: AbortSignal) {
		const response = await fetch(resolve('/api/game/search/[query]', { query }), { signal });
		const data: unknown = await response.json();
		if (!response.ok) {
			const error = v.safeParse(gameSearchErrorSchema, data);
			throw new Error(
				error.success ? error.output.error : `Failed to search games (${response.status})`
			);
		}
		return v.parse(gameSearchResultsSchema, data);
	}

	function initializeImageLoadingStates(_: string, games: GameSearchResult[]) {
		imageLoadingStates = Object.fromEntries(
			games.filter((game) => game.coverImgId).map((game) => [game.id, true])
		);
	}

	function selectGame(game: GameSearchResult) {
		onSelected?.(noParent ? game.id : (game.parentGame ?? game.versionParent ?? game.id), game);
	}
</script>

<Search
	search={searchGames}
	getKey={(game) => game.id}
	getLabel={(game) => game.name}
	onSelected={selectGame}
	onResults={initializeImageLoadingStates}
	{inputId}
	placeholder="Search for a game..."
	noResultsText="No games found"
>
	{#snippet result(game)}
		<div class="flex items-center gap-3">
			<div class="relative flex h-16 w-12 shrink-0 items-center">
				{#if game.coverImgId}
					{#if imageLoadingStates[game.id] !== false}
						<Skeleton class="absolute inset-0 rounded" />
					{/if}
					<img
						src={constructImageUrl(game.coverImgId, 'cover_small')}
						alt={game.name}
						class="absolute inset-0 h-full w-full rounded object-cover text-transparent"
						onload={() => (imageLoadingStates[game.id] = false)}
					/>
				{:else}
					<Skeleton class="absolute inset-0 rounded" />
				{/if}
			</div>
			<div class="min-w-0 flex-1">
				<div class="truncate font-medium">{game.name}</div>
				{#if game.releaseDate}
					<div class="text-sm text-muted-foreground">
						{new Date(game.releaseDate).getFullYear()}
					</div>
				{/if}
			</div>
		</div>
	{/snippet}
</Search>
