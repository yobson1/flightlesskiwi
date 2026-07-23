<script lang="ts">
	import FingerprintIcon from '@lucide/svelte/icons/fingerprint';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import { deserialize } from '$app/forms';
	import { createWebAuthnRegistration, type WebAuthnRegistration } from '$lib/client/webauthn';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import { Input } from '$lib/components/ui/input/index.js';

	interface Props {
		rpName: string;
		username: string;
		credentialUserId: Uint8Array;
		excludedCredentialIds: Uint8Array[];
		onRedirect?: (location: string) => void | Promise<void>;
	}

	let { rpName, username, credentialUserId, excludedCredentialIds, onRedirect }: Props = $props();

	let registration = $state<WebAuthnRegistration | null>(null);
	let name = $state('');
	let message = $state('');
	let pending = $state(false);

	async function createPasskey() {
		message = '';
		pending = true;
		try {
			registration = await createWebAuthnRegistration({
				rpName,
				userId: credentialUserId,
				username,
				excludedCredentialIds
			});
			name = registration.suggested_name;
		} catch (cause) {
			if (cause instanceof DOMException && cause.name === 'NotAllowedError') {
				message = 'Passkey creation was cancelled.';
			} else {
				message = cause instanceof Error ? cause.message : 'Unable to create passkey';
			}
		} finally {
			pending = false;
		}
	}

	async function savePasskey(event: SubmitEvent) {
		event.preventDefault();
		if (registration === null) return;
		message = '';
		pending = true;
		try {
			const body = new URLSearchParams({
				name,
				attestation_object: registration.attestation_object,
				client_data_json: registration.client_data_json
			});
			const response = await fetch('/2fa/passkey/register', {
				method: 'POST',
				headers: {
					accept: 'application/json',
					'content-type': 'application/x-www-form-urlencoded',
					'x-sveltekit-action': 'true'
				},
				body
			});
			const result = deserialize(await response.text());
			if (result.type === 'failure') {
				message =
					typeof result.data?.message === 'string'
						? result.data.message
						: 'Unable to register passkey';
			} else if (result.type === 'redirect') {
				await onRedirect?.(result.location);
			} else if (result.type === 'error') {
				message = 'Something went wrong. Please try again.';
			}
		} catch (cause) {
			message = cause instanceof Error ? cause.message : 'Unable to save passkey';
		} finally {
			pending = false;
		}
	}
</script>

<Card.Root>
	<Card.Header>
		<div class="grid grid-cols-[2.25rem_1fr_2.25rem] items-center gap-2">
			<div class="flex size-9 items-center justify-center rounded-full bg-muted">
				<FingerprintIcon class="size-4" />
			</div>
			<Card.Title class="text-center">
				{registration ? 'Name your passkey' : 'Create a passkey'}
			</Card.Title>
			<span aria-hidden="true"></span>
		</div>
		<Card.Description class="text-center text-balance">
			{#if registration}
				Choose a name that will help you recognize this passkey later.
			{:else}
				Use your fingerprint, face, screen lock, or security key to protect your account.
			{/if}
		</Card.Description>
	</Card.Header>
	<Card.Content>
		{#if message}
			<p
				class="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
				role="alert"
			>
				{message}
			</p>
		{/if}

		{#if registration}
			<form onsubmit={savePasskey}>
				<Field.Group>
					<Field.Field>
						<Field.Label for="passkey-name">Passkey name</Field.Label>
						<Input
							id="passkey-name"
							bind:value={name}
							placeholder={registration.suggested_name}
							autocomplete="off"
							maxlength={64}
							disabled={pending}
							autofocus
							required
						/>
					</Field.Field>
					<Button type="submit" size="lg" class="w-full" disabled={pending || !name.trim()}>
						{#if pending}
							<LoaderCircleIcon class="animate-spin" />
							Saving passkey…
						{:else}
							Save passkey
						{/if}
					</Button>
				</Field.Group>
			</form>
		{:else}
			<Button size="lg" class="w-full" disabled={pending} onclick={createPasskey}>
				{#if pending}
					<LoaderCircleIcon class="animate-spin" />
					Waiting for your device…
				{:else}
					<FingerprintIcon />
					Create passkey
				{/if}
			</Button>
		{/if}
	</Card.Content>
</Card.Root>
