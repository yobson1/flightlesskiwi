<script lang="ts">
	import SimpleIconsGogdotcom from '~icons/simple-icons/gogdotcom';
	import SimpleIconsSteam from '~icons/simple-icons/steam';
	import SimpleIconsItchdotio from '~icons/simple-icons/itchdotio';
	import SimpleIconsEpicgames from '~icons/simple-icons/epicgames';
	import { GameSource } from '$lib/enums/igdb';
	import { Separator } from '$lib/components/ui/separator';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { onMount } from 'svelte';

	const iconSize = '28px';

	interface Props {
		gameId: number;
	}

	let { gameId }: Props = $props();
	let game: Game | null = $state(null);
	let loading = $state(true);
	let error: string | null = $state(null);

	onMount(async () => {
		try {
			const response = await fetch(`/api/game/${gameId}`);

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || 'Failed to fetch game');
			}

			game = await response.json();
		} catch (err) {
			error = err instanceof Error ? err.message : 'An error occurred';
		} finally {
			loading = false;
		}
	});
</script>

{#if loading}
	<div class="game-layout">
		<Skeleton class="h-[352px] w-[264px] rounded-lg" />
		<div class="game-content">
			<div class="game-header">
				<Skeleton class="mb-2 h-8 w-80" />
				<Skeleton class="mb-4 h-4 w-16" />

				<div class="platforms">
					<Skeleton class="h-7 w-7 rounded" />
					<Skeleton class="h-7 w-7 rounded" />
					<Skeleton class="h-7 w-7 rounded" />
				</div>
			</div>

			<Separator />

			<div class="companies">
				<div class="company-section">
					<Skeleton class="mb-2 h-5 w-24" />
					<div class="space-y-1">
						<Skeleton class="h-4 w-32" />
						<Skeleton class="h-4 w-28" />
					</div>
				</div>
				<div class="company-section">
					<Skeleton class="mb-2 h-5 w-24" />
					<div class="space-y-1">
						<Skeleton class="h-4 w-36" />
					</div>
				</div>
				<Separator />
				<div class="company-section">
					<Skeleton class="mb-2 h-5 w-16" />
					<div class="space-y-1">
						<Skeleton class="h-4 w-20" />
					</div>
				</div>
			</div>
		</div>
	</div>
{:else if error}
	<div class="error">
		<h2>Error loading game</h2>
		<p>{error}</p>
	</div>
{:else if game}
	<div class="game-layout">
		<div class="cover-wrapper" style={`--cover-glow: url(${game.cover_url});`}>
			<img src={game.cover_url} alt={game.name} class="cover" />
		</div>

		<div class="game-content">
			<div class="game-header">
				<h1>{game.name}</h1>
				{#if game.release_date}
					<h2 class="release-date">{game.release_date}</h2>
				{/if}

				<div class="platforms">
					{#each game.platforms as platform (platform)}
						<a href={platform.url}>
							{#if platform.game_source === GameSource.gog}
								<SimpleIconsGogdotcom style={`height: ${iconSize}; width: ${iconSize};`} />
							{/if}
							{#if platform.game_source === GameSource.steam}
								<SimpleIconsSteam style={`height: ${iconSize}; width: ${iconSize};`} />
							{/if}
							{#if platform.game_source === GameSource.itch_io}
								<SimpleIconsItchdotio style={`height: ${iconSize}; width: ${iconSize};`} />
							{/if}
							{#if platform.game_source === GameSource.epic_game_store}
								<SimpleIconsEpicgames style={`height: ${iconSize}; width: ${iconSize};`} />
							{/if}
						</a>
					{/each}
				</div>
			</div>

			<Separator />

			<div class="companies">
				{#if game.developers.length > 0}
					<div class="company-section">
						<h3>Developers</h3>
						<ul>
							{#each game.developers as developer (developer)}
								<li>
									{#if developer.url}
										<a href={developer.url} rel="external">{developer.name}</a>
									{:else}
										{developer.name}
									{/if}
								</li>
							{/each}
						</ul>
					</div>
				{/if}
				{#if game.publishers.length > 0}
					<div class="company-section">
						<h3>Publishers</h3>
						<ul>
							{#each game.publishers as publisher (publisher)}
								<li>
									{#if publisher.url}
										<a href={publisher.url} rel="external">{publisher.name}</a>
									{:else}
										{publisher.name}
									{/if}
								</li>
							{/each}
						</ul>
					</div>
				{/if}
				{#if (game.developers.length > 0 || game.publishers.length > 0) && game.engines.length > 0}
					<Separator />
				{/if}
				{#if game.engines.length > 0}
					<div class="company-section">
						<h3>Engine{game.engines.length > 1 ? 's' : ''}</h3>
						<ul>
							{#each game.engines as engine (engine)}
								<li>
									{#if engine.url}
										<a href={engine.url} rel="external">{engine.name}</a>
									{:else}
										{engine.name}
									{/if}
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.game-layout {
		display: flex;
		gap: 2rem;
		align-items: flex-start;
	}

	.cover-wrapper {
		position: relative;
	}

	.cover {
		width: 264px;
		height: auto;
		border-radius: 8px;
		position: relative;
	}

	.cover-wrapper::before {
		content: '';
		position: absolute;
		inset: 0;
		background-image: var(--cover-glow);
		border-radius: inherit;
		filter: blur(22px) brightness(1.1);
		transform: scale(0.99) translateX(-4px);
	}

	.game-content {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 1.7rem;
	}

	.game-header {
		display: flex;
		flex-direction: column;
	}

	.game-header h1 {
		margin: 0;
		font-size: 2rem;
		font-weight: 700;
	}

	.release-date {
		margin: 0;
		font-size: 1rem;
		font-weight: 400;
		color: var(--color-muted-foreground);
	}

	.platforms {
		margin-top: 1.5rem;
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.companies {
		display: flex;
		gap: 1.5rem;
		flex-wrap: wrap;
	}

	.company-section h3 {
		margin: 0 0 0.5rem 0;
		font-size: 1.25rem;
		font-weight: 600;
	}

	.company-section li {
		margin-bottom: 0.25rem;
	}

	.company-section a {
		color: inherit;
		text-decoration: underline;
	}

	.company-section a:hover {
		text-decoration: none;
	}

	.platforms a {
		color: var(--color-primary);
		transition:
			filter 0.2s ease,
			transform 0.2s ease;
	}

	.platforms a:hover {
		filter: brightness(1.3) drop-shadow(0 0 1px var(--color-primary));
		transform: scale(1.05);
	}

	.skeleton-cover {
		width: 264px;
		/* https://api-docs.igdb.com/#images says it should be 374px but im getting 352px */
		height: 352px;
		background-color: var(--color-muted);
		border-radius: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0.7;
	}

	.skeleton-content {
		flex: 1;
		background-color: var(--color-muted);
		border-radius: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 200px;
		opacity: 0.7;
	}

	.error {
		text-align: center;
		color: var(--color-destructive);
		padding: 2rem;
	}

	/* Mobile responsiveness */
	@media (max-width: 768px) {
		.game-layout {
			flex-direction: column;
			align-items: center;
		}

		.cover {
			width: 200px;
		}

		.game-content {
			text-align: center;
		}

		.companies {
			flex-direction: column;
			gap: 1.5rem;
		}
	}
</style>
