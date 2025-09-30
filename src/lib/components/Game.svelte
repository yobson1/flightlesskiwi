<script lang="ts">
	import SimpleIconsGogdotcom from '~icons/simple-icons/gogdotcom';
	import SimpleIconsSteam from '~icons/simple-icons/steam';
	import SimpleIconsItchdotio from '~icons/simple-icons/itchdotio';
	import SimpleIconsEpicgames from '~icons/simple-icons/epicgames';
	import type { ImageSize, Game } from '$lib/types/igdb';
	import { GameSource } from '$lib/enums/igdb';
	import { Separator } from '$lib/components/ui/separator';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { onMount } from 'svelte';

	function constructImageUrl(imageId: string, size: ImageSize): string {
		return `https://images.igdb.com/igdb/image/upload/t_${size}/${imageId}.webp`;
	}

	function formatReleaseDate(timestamp: number): string {
		return new Date(timestamp * 1000).toDateString();
	}

	const iconSize = '28px';

	const platformIcons = {
		[GameSource.gog]: SimpleIconsGogdotcom,
		[GameSource.steam]: SimpleIconsSteam,
		[GameSource.itch_io]: SimpleIconsItchdotio,
		[GameSource.epic_game_store]: SimpleIconsEpicgames
	};
	const pcPlatforms = Object.keys(platformIcons).map(Number);

	interface Props {
		gameId: number;
	}

	let { gameId }: Props = $props();
	let game: Game | null = $state(null);
	let loading = $state(true);
	let error: string | null = $state(null);

	let coverUrl = $derived.by(() => {
		if (!game?.cover?.image_id) return null;
		return constructImageUrl(game.cover.image_id, 'cover_big');
	});

	let developers = $derived.by(() => {
		if (!game?.involved_companies) return [];
		return game.involved_companies
			.filter((company) => company.developer)
			.map((involved) => involved.company);
	});

	let publishers = $derived.by(() => {
		if (!game?.involved_companies) return [];
		return game.involved_companies
			.filter((company) => company.publisher)
			.map((involved) => involved.company);
	});

	let availablePlatforms = $derived.by(() => {
		if (!game) return [];
		return game.external_games.filter((eg) => pcPlatforms.includes(eg.external_game_source));
	});

	let hasCompanyInfo = $derived(developers.length > 0 || publishers.length > 0);
	let hasEngines = $derived.by(() => {
		return (game?.game_engines?.length ?? 0) > 0;
	});

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

<div class="game">
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

				<div class="game-details">
					<div class="details-section">
						<Skeleton class="mb-2 h-5 w-24" />
						<div class="space-y-1">
							<Skeleton class="h-4 w-32" />
							<Skeleton class="h-4 w-28" />
						</div>
					</div>
					<div class="details-section">
						<Skeleton class="mb-2 h-5 w-24" />
						<div class="space-y-1">
							<Skeleton class="h-4 w-36" />
						</div>
					</div>
					<Separator />
					<div class="details-section">
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
			<div class="cover-wrapper" style={`--cover-glow: url(${coverUrl});`}>
				<img src={coverUrl} alt={game.name} class="cover" />
			</div>

			<div class="game-content">
				<div class="game-header">
					<h1>{game.name}</h1>
					<h2 class="release-date">{formatReleaseDate(game.first_release_date)}</h2>

					{#if availablePlatforms.length > 0}
						<div class="platforms">
							{#each availablePlatforms as platform (platform.id)}
								{@const IconComponent =
									platformIcons[platform.external_game_source as keyof typeof platformIcons]}
								<a href={platform.url} aria-label={`View on ${platform.external_game_source}`}>
									<IconComponent width={iconSize} height={iconSize} />
								</a>
							{/each}
						</div>
					{/if}
				</div>

				<Separator />

				<div class="game-details">
					{#if developers.length > 0}
						<div class="details-section">
							<h3>Developers</h3>
							<ul>
								{#each developers as developer (developer.id)}
									<li>
										{#if developer.websites?.[0]?.url}
											<a href={developer.websites[0].url} rel="external">{developer.name}</a>
										{:else}
											{developer.name}
										{/if}
									</li>
								{/each}
							</ul>
						</div>
					{/if}
					{#if publishers.length > 0}
						<div class="details-section">
							<h3>Publishers</h3>
							<ul>
								{#each publishers as publisher (publisher.id)}
									<li>
										{#if publisher.websites?.[0]?.url}
											<a href={publisher.websites[0].url} rel="external">{publisher.name}</a>
										{:else}
											{publisher.name}
										{/if}
									</li>
								{/each}
							</ul>
						</div>
					{/if}
					{#if hasCompanyInfo && hasEngines}
						<Separator />
					{/if}
					{#if hasEngines && game.game_engines}
						<div class="details-section">
							<h3>Engine{game.game_engines.length > 1 ? 's' : ''}</h3>
							<ul>
								{#each game.game_engines as engine (engine.id)}
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
</div>

<style>
	.game {
		margin-bottom: 1rem;
	}

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

	.game-details {
		display: flex;
		gap: 1.5rem;
		flex-wrap: wrap;
	}

	.details-section h3 {
		margin: 0 0 0.5rem 0;
		font-size: 1.25rem;
		font-weight: 600;
	}

	.details-section li {
		margin-bottom: 0.25rem;
	}

	.details-section a {
		color: inherit;
		text-decoration: underline;
	}

	.details-section a:hover {
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

		.game-details {
			flex-direction: column;
			gap: 1.5rem;
		}
	}
</style>
