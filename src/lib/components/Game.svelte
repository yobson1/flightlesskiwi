<script lang="ts">
	import SimpleIconsGogdotcom from '~icons/simple-icons/gogdotcom';
	import SimpleIconsSteam from '~icons/simple-icons/steam';
	import SimpleIconsItchdotio from '~icons/simple-icons/itchdotio';
	import SimpleIconsEpicgames from '~icons/simple-icons/epicgames';
	import type { Game } from '$lib/types/igdb';
	import { constructImageUrl } from '$lib/igdb';
	import { GameSource, WebsiteCategory } from '$lib/enums/igdb';
	import { Separator } from '$lib/components/ui/separator';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { onMount } from 'svelte';

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

	const websiteCategoryToGameSource: Record<number, GameSource> = {
		[WebsiteCategory.steam]: GameSource.steam,
		[WebsiteCategory.gog]: GameSource.gog,
		[WebsiteCategory.itch]: GameSource.itch_io,
		[WebsiteCategory.epicgames]: GameSource.epic_game_store
	};

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
		const platformMap = new Map<number, string>();

		// they can be in either external_games or websites
		game?.external_games
			?.filter((eg) => pcPlatforms.includes(eg.external_game_source))
			.forEach((eg) => platformMap.set(eg.external_game_source, eg.url));
		game?.websites?.forEach((website) => {
			const gameSource = websiteCategoryToGameSource[website.type];
			if (gameSource !== undefined && !platformMap.has(gameSource)) {
				platformMap.set(gameSource, website.url);
			}
		});

		return Array.from(platformMap.entries()).map(([source, url]) => ({ source, url }));
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

<div class="mb-4">
	{#if loading}
		<div class="flex items-start gap-8 max-md:flex-col max-md:items-center">
			<Skeleton class="h-[352px] w-[264px] rounded-lg" />
			<div class="flex flex-1 flex-col gap-4">
				<div class="flex flex-col">
					<Skeleton class="mb-2 h-8 w-80" />
					<Skeleton class="mb-4 h-4 w-16" />

					<div class="mt-4 flex flex-wrap gap-2">
						<Skeleton class="h-7 w-7 rounded" />
						<Skeleton class="h-7 w-7 rounded" />
						<Skeleton class="h-7 w-7 rounded" />
					</div>
				</div>

				<Separator />

				<div class="flex flex-wrap gap-4 max-md:flex-col max-md:gap-4">
					<div>
						<Skeleton class="mb-2 h-5 w-24" />
						<div class="space-y-1">
							<Skeleton class="h-4 w-32" />
							<Skeleton class="h-4 w-28" />
						</div>
					</div>
					<div>
						<Skeleton class="mb-2 h-5 w-24" />
						<div class="space-y-1">
							<Skeleton class="h-4 w-36" />
						</div>
					</div>
					<Separator />
					<div>
						<Skeleton class="mb-2 h-5 w-16" />
						<div class="space-y-1">
							<Skeleton class="h-4 w-20" />
						</div>
					</div>
				</div>
			</div>
		</div>
	{:else if error}
		<div class="p-8 text-center text-destructive">
			<h2>Error loading game</h2>
			<p>{error}</p>
		</div>
	{:else if game}
		<div class="flex items-start gap-8 max-md:flex-col max-md:items-center">
			<div class="cover-wrapper relative" style={`--cover-glow: url(${coverUrl});`}>
				<img src={coverUrl} alt={game.name} class="cover" />
			</div>

			<div class="flex flex-1 flex-col gap-4 max-md:text-center">
				<div class="flex flex-col">
					<h1 class="m-0 text-4xl font-bold">{game.name}</h1>
					<h2 class="m-0 text-base font-normal text-muted-foreground">
						{formatReleaseDate(game.first_release_date)}
					</h2>

					{#if availablePlatforms.length > 0}
						<div class="mt-4 flex flex-wrap gap-2">
							{#each availablePlatforms as platform (platform.source)}
								{@const IconComponent =
									platformIcons[platform.source as keyof typeof platformIcons]}
								<a
									href={platform.url}
									class="text-primary transition-all duration-200 ease-in-out hover:scale-105 hover:brightness-125 hover:drop-shadow-[0_0_0.5px_var(--primary)]"
								>
									<IconComponent width={iconSize} height={iconSize} />
								</a>
							{/each}
						</div>
					{/if}
				</div>

				<Separator />

				<div class="flex flex-wrap gap-4 max-md:flex-col max-md:gap-4">
					{#if developers.length > 0}
						<div>
							<h3 class="m-0 mb-2 text-xl font-semibold">Developers</h3>
							<ul>
								{#each developers as developer (developer.id)}
									<li class="mb-1">
										{#if developer.websites?.[0]?.url}
											<a
												href={developer.websites[0].url}
												rel="external"
												class="underline hover:no-underline">{developer.name}</a
											>
										{:else}
											{developer.name}
										{/if}
									</li>
								{/each}
							</ul>
						</div>
					{/if}
					{#if publishers.length > 0}
						<div>
							<h3 class="m-0 mb-2 text-xl font-semibold">Publishers</h3>
							<ul>
								{#each publishers as publisher (publisher.id)}
									<li class="mb-1">
										{#if publisher.websites?.[0]?.url}
											<a
												href={publisher.websites[0].url}
												rel="external"
												class="underline hover:no-underline">{publisher.name}</a
											>
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
						<div>
							<h3 class="m-0 mb-2 text-xl font-semibold">
								Engine{game.game_engines.length > 1 ? 's' : ''}
							</h3>
							<ul>
								{#each game.game_engines as engine (engine.id)}
									<li class="mb-1">
										{#if engine.url}
											<a href={engine.url} rel="external" class="underline hover:no-underline"
												>{engine.name}</a
											>
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

	/* Mobile cover size */
	@media (max-width: 768px) {
		.cover {
			width: 200px;
		}
	}
</style>
