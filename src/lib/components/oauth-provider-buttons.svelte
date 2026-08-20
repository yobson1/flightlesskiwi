<script lang="ts">
	import OAuthProviderIcon from '#lib/components/oauth-provider-icon.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import { getOAuthProviderName, type OAuthProvider } from '#lib/types/oauth.js';

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
				<OAuthProviderIcon {provider} />
				{getOAuthProviderName(provider)}
			</Button>
		{/each}
	</Field.Field>
{/if}
