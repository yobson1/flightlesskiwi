<script lang="ts">
	import SimpleIconsGogdotcom from '~icons/simple-icons/gogdotcom';
	import SimpleIconsSteam from '~icons/simple-icons/steam';
	import SimpleIconsItchdotio from '~icons/simple-icons/itchdotio';
	import SimpleIconsEpicgames from '~icons/simple-icons/epicgames';
	import { GameSource } from '$lib/enums/igdb';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const iconSize = '28px';
</script>

<div class="game-layout">
	<div class="cover-wrapper" style={`--cover-glow: url(${data.game.cover_url});`}>
		<img src={data.game.cover_url} alt={data.game.name} class="cover" />
	</div>

	<div class="game-content">
		<div class="game-header">
			<h1>{data.game.name}</h1>
			{#if data.game.release_date}
				<h2 class="release-date">{data.game.release_date}</h2>
			{/if}

			<div class="platforms">
				{#each data.game.platforms as platform (platform)}
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
			{#if (data.game.developers.length > 0 || data.game.publishers.length > 0) && data.game.engines.length > 0}
				<Separator />
			{/if}
			{#if data.game.engines.length > 0}
				<div class="company-section">
					<h3>Engine{data.game.engines.length > 1 ? 's' : ''}</h3>
					<ul>
						{#each data.game.engines as engine (engine)}
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
