<script lang="ts">
	import SimpleIconsDiscord from '~icons/simple-icons/discord';
	import SimpleIconsGithub from '~icons/simple-icons/github';
	import SimpleIconsTwitch from '~icons/simple-icons/twitch';
	import type { OAuthProvider } from '$lib/types/oauth';

	interface Props {
		provider: OAuthProvider;
		class?: string;
	}

	let { provider, class: className }: Props = $props();
</script>

{#if provider === 'github'}
	<SimpleIconsGithub class={className} />
{:else if provider === 'discord'}
	<SimpleIconsDiscord class={className} />
{:else}
	<SimpleIconsTwitch class={className} />
{/if}
