<script lang="ts">
	import SimpleIconsDiscord from '~icons/simple-icons/discord';
	import SimpleIconsGithub from '~icons/simple-icons/github';
	import SimpleIconsTwitch from '~icons/simple-icons/twitch';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import { getOAuthProviderName, type OAuthProvider } from '$lib/types/oauth';

	interface Props {
		providers: OAuthProvider[];
		verb: 'Sign in' | 'Sign up' | 'Continue';
		flow?: 'login' | 'reauth';
		returnView?: 'login' | 'signup';
	}

	let { providers, verb, flow = 'login', returnView = 'login' }: Props = $props();

	function providerURL(provider: OAuthProvider): string {
		return flow === 'reauth'
			? `/auth/oauth/${provider}?flow=reauth&return_to=${encodeURIComponent('/settings')}`
			: `/auth/oauth/${provider}?return_to=${encodeURIComponent(`/#${returnView}`)}`;
	}
</script>

{#if providers.length > 0}
	<Field.Separator class="*:data-[slot=field-separator-content]:bg-card">
		Or continue with
	</Field.Separator>
	<Field.Field class="grid grid-cols-1 gap-3 sm:grid-cols-3">
		{#each providers as provider (provider)}
			<Button
				variant="outline"
				type="button"
				href={providerURL(provider)}
				data-sveltekit-reload
				aria-label={`${verb} with ${getOAuthProviderName(provider)}`}
			>
				{#if provider === 'github'}
					<SimpleIconsGithub />
				{:else if provider === 'discord'}
					<SimpleIconsDiscord />
				{:else}
					<SimpleIconsTwitch />
				{/if}
				{getOAuthProviderName(provider)}
			</Button>
		{/each}
	</Field.Field>
{/if}
