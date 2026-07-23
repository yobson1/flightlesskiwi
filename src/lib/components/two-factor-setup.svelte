<script lang="ts">
	import FingerprintIcon from '@lucide/svelte/icons/fingerprint';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';
	import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';

	interface Props {
		registeredPasskey: boolean;
		registeredTOTP: boolean;
		onSelect: (location: '/2fa/passkey/register' | '/2fa/totp/setup') => void | Promise<void>;
		onComplete: () => void | Promise<void>;
	}

	let { registeredPasskey, registeredTOTP, onSelect, onComplete }: Props = $props();
</script>

<Card.Root>
	<Card.Header>
		<div class="grid grid-cols-[2.25rem_1fr_2.25rem] items-center gap-2">
			<div class="flex size-9 items-center justify-center rounded-full bg-muted">
				<ShieldCheckIcon class="size-4" />
			</div>
			<Card.Title class="text-center">Secure your account</Card.Title>
			<span aria-hidden="true"></span>
		</div>
		<Card.Description class="text-center text-balance">
			{#if registeredTOTP && registeredPasskey}
				Your authenticator and passkey are ready to use.
			{:else if registeredTOTP}
				Two-factor authentication is ready. Add an optional passkey for passwordless sign-in.
			{:else if registeredPasskey}
				Your passkey is ready. Add an authenticator app to finish two-factor authentication.
			{:else}
				Set up an authenticator for two-factor authentication, then optionally add a passkey for
				passwordless sign-in.
			{/if}
		</Card.Description>
	</Card.Header>
	<Card.Content class="space-y-3">
		{#if !registeredTOTP}
			<Button
				size="lg"
				class="h-auto w-full justify-start px-4 py-3 text-left"
				onclick={() => onSelect('/2fa/totp/setup')}
			>
				<KeyRoundIcon class="size-5" />
				<span class="flex flex-col items-start">
					<span>Set up an authenticator app</span>
					<span class="text-xs font-normal opacity-75"
						>Recommended · enter a six-digit code after signing in</span
					>
				</span>
			</Button>
		{/if}
		{#if !registeredPasskey}
			<Button
				variant={registeredTOTP ? 'default' : 'outline'}
				size="lg"
				class="h-auto w-full justify-start px-4 py-3 text-left"
				onclick={() => onSelect('/2fa/passkey/register')}
			>
				<FingerprintIcon class="size-5" />
				<span class="flex flex-col items-start">
					<span>Add a passkey</span>
					<span
						class="text-xs font-normal"
						class:text-muted-foreground={!registeredTOTP}
						class:opacity-75={registeredTOTP}>Single-click, passwordless sign-in</span
					>
				</span>
			</Button>
		{/if}
		{#if registeredTOTP && registeredPasskey}
			<Button size="lg" class="w-full" onclick={onComplete}>
				<ShieldCheckIcon />
				Done
			</Button>
		{/if}
	</Card.Content>
</Card.Root>
