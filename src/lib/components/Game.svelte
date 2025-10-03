<script lang="ts">
	import SimpleIconsGogdotcom from '~icons/simple-icons/gogdotcom';
	import SimpleIconsSteam from '~icons/simple-icons/steam';
	import SimpleIconsItchdotio from '~icons/simple-icons/itchdotio';
	import SimpleIconsEpicgames from '~icons/simple-icons/epicgames';
	import type { FullGame } from '$lib/server/db/schema';
	import { constructImageUrl } from '$lib/igdb';
	import { Separator } from '$lib/components/ui/separator';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { onMount } from 'svelte';

	const iconSize = '28px';

	const platformIcons = [
		SimpleIconsGogdotcom,
		SimpleIconsSteam,
		SimpleIconsItchdotio,
		SimpleIconsEpicgames
	];

	interface Props {
		gameId: number;
	}

	let { gameId }: Props = $props();
	let game: FullGame | null = $state(null);
	let gameName = $derived.by(() => game?.names[0]?.name);
	let loading = $state(true);
	let error: string | null = $state(null);

	let coverUrl = $derived.by(() => {
		if (!game?.coverImgId) return null;
		return constructImageUrl(game.coverImgId, 'cover_big');
	});

	let developers = $derived.by(() => {
		if (!game?.involvedCompanies) return [];
		return game.involvedCompanies
			.filter((company) => company.developer)
			.map((involved) => involved.company);
	});

	let publishers = $derived.by(() => {
		if (!game?.involvedCompanies) return [];
		return game.involvedCompanies
			.filter((company) => company.publisher)
			.map((involved) => involved.company);
	});

	let hasCompanyInfo = $derived(developers.length > 0 || publishers.length > 0);
	let hasEngines = $derived.by(() => {
		return (game?.usedEngines?.length ?? 0) > 0;
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

<!-- <div class="w-1/2 min-w-0 max-md:w-full"> -->
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
			<img src={coverUrl} alt={gameName} class="cover" />
		</div>

		<div class="flex flex-1 flex-col gap-4 max-md:text-center">
			<div class="flex flex-col">
				<h1 class="m-0 text-4xl font-bold">{gameName}</h1>
				<h2 class="m-0 text-base font-normal text-muted-foreground">
					{new Date(game.releaseDate!).getFullYear()}
				</h2>

				{#if game.storeLinks?.length > 0}
					<div class="mt-4 flex flex-wrap gap-2">
						{#each game.storeLinks as link (link.storeId)}
							{@const IconComponent = platformIcons[link.storeId]}
							<a
								title={link.store.name}
								href={link.url}
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
									{#if developer.url}
										<a href={developer.url} rel="external" class="underline hover:no-underline"
											>{developer.name}</a
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
									{#if publisher.url}
										<a href={publisher.url} rel="external" class="underline hover:no-underline"
											>{publisher.name}</a
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
				{#if hasEngines && game.usedEngines}
					<div>
						<h3 class="m-0 mb-2 text-xl font-semibold">
							Engine{game.usedEngines.length > 1 ? 's' : ''}
						</h3>
						<ul>
							{#each game.usedEngines as usedEngine (usedEngine.engine)}
								<li class="mb-1">
									{#if usedEngine.engine.url}
										<a
											href={usedEngine.engine.url}
											rel="external"
											class="underline hover:no-underline">{usedEngine.engine.name}</a
										>
									{:else}
										{usedEngine.engine.name}
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
