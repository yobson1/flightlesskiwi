<script lang="ts">
	import GamepadIcon from '@lucide/svelte/icons/gamepad-2';
	import { constructImageUrl } from '$lib/igdb';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as v from 'valibot';

	const gameResponseSchema = v.object({
		names: v.array(v.object({ name: v.string() })),
		releaseDate: v.nullable(v.string()),
		coverImgId: v.nullable(v.string()),
		involvedCompanies: v.array(
			v.object({
				developer: v.boolean(),
				publisher: v.boolean(),
				company: v.object({ name: v.string() })
			})
		)
	});
	const gameErrorSchema = v.object({ error: v.string() });
	type GameResponse = v.InferOutput<typeof gameResponseSchema>;

	interface Props {
		gameId: number;
	}

	let { gameId }: Props = $props();
	let game = $state<GameResponse | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);

	let gameName = $derived(game?.names[0]?.name ?? 'Unknown game');
	let releaseYear = $derived(
		game?.releaseDate ? new Date(game.releaseDate).getFullYear().toString() : 'Unknown'
	);
	let developer = $derived(
		game?.involvedCompanies.find((involvement) => involvement.developer)?.company.name ??
			'Unknown developer'
	);
	let publisher = $derived(
		game?.involvedCompanies.find((involvement) => involvement.publisher)?.company.name ??
			'Unknown publisher'
	);
	let coverUrl = $derived(
		game?.coverImgId ? constructImageUrl(game.coverImgId, 'cover_small') : null
	);

	$effect(() => {
		const requestedGameId = gameId;
		const controller = new AbortController();
		game = null;
		error = null;
		loading = true;
		void loadGame(requestedGameId, controller.signal);

		return () => controller.abort();
	});

	async function loadGame(requestedGameId: number, signal: AbortSignal) {
		try {
			const response = await fetch(`/api/game/${requestedGameId}`, { signal });
			const body: unknown = await response.json();
			if (!response.ok) {
				const result = v.safeParse(gameErrorSchema, body);
				throw new Error(result.success ? result.output.error : 'Failed to fetch game');
			}
			const result = v.safeParse(gameResponseSchema, body);
			if (!result.success) throw new Error('Invalid game response');
			game = result.output;
		} catch (cause) {
			if (cause instanceof Error && cause.name === 'AbortError') return;
			error = cause instanceof Error ? cause.message : 'Failed to fetch game';
		} finally {
			if (!signal.aborted) loading = false;
		}
	}
</script>

<div class="flex min-w-0 items-center gap-3 rounded-lg border bg-muted/30 p-2.5" aria-live="polite">
	{#if loading}
		<Skeleton class="h-16 w-12 shrink-0 rounded-md" />
		<div class="min-w-0 flex-1 space-y-2">
			<Skeleton class="h-4 w-48 max-w-full" />
			<Skeleton class="h-3 w-64 max-w-full" />
		</div>
	{:else if error}
		<div
			class="flex h-16 w-12 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
		>
			<GamepadIcon class="size-5" />
		</div>
		<div class="min-w-0">
			<p class="text-sm font-medium text-destructive">Unable to load game details</p>
			<p class="truncate text-xs text-muted-foreground">{error}</p>
		</div>
	{:else if game}
		{#if coverUrl}
			<img
				src={coverUrl}
				alt={`${gameName} cover`}
				class="h-16 w-12 shrink-0 rounded-md object-cover"
			/>
		{:else}
			<div
				class="flex h-16 w-12 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
			>
				<GamepadIcon class="size-5" />
			</div>
		{/if}
		<div class="min-w-0">
			<p class="truncate text-base leading-snug font-medium">
				{gameName} <span class="text-muted-foreground">· {releaseYear}</span>
			</p>
			<p class="truncate text-sm text-muted-foreground">{developer} · {publisher}</p>
		</div>
	{/if}
</div>
