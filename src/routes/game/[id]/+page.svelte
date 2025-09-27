<script lang="ts">
	import SimpleIconsGogdotcom from '~icons/simple-icons/gogdotcom';
	import SimpleIconsSteam from '~icons/simple-icons/steam';
	import SimpleIconsItchdotio from '~icons/simple-icons/itchdotio';
	import SimpleIconsEpicgames from '~icons/simple-icons/epicgames';
	import { GameSource } from '$lib/enums/igdb';
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const iconSize = '28px';
</script>

<div class="game-layout">
	<img src={data.game.cover_url} alt={data.game.name} class="cover" />

	<div class="game-content">
		<div class="game-header">
			<h2>{data.game.name}</h2>

			<div class="platforms">
				{#each data.game.platforms as platform (platform)}
					<Button variant="link" size="icon" href={platform.url}>
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
					</Button>
				{/each}
			</div>
		</div>

		<Separator />

		<div class="companies">
			{#if data.game.developers.length > 0}
				<div class="company-section">
					<h3>Developers</h3>
					<ul>
						{#each data.game.developers as developer (developer)}
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
			<Separator orientation="vertical" />
			{#if data.game.publishers.length > 0}
				<div class="company-section">
					<h3>Publishers</h3>
					<ul>
						{#each data.game.publishers as publisher (publisher)}
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
		</div>
	</div>
</div>

<style>
	.game-layout {
		display: flex;
		gap: 2rem;
		align-items: flex-start;
	}

	.cover {
		width: 264px;
		height: auto;
		border-radius: 8px;
		flex-shrink: 0;
	}

	.game-content {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}

	.game-header {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.game-header h2 {
		margin: 0;
		font-size: 2rem;
		font-weight: 700;
	}

	.platforms {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.companies {
		display: flex;
		gap: 3rem;
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
