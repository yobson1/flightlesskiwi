<script lang="ts">
	import FingerprintIcon from '@lucide/svelte/icons/fingerprint';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
	import { MAX_PASSWORD_LENGTH, TOTP_CODE_LENGTH } from '$lib/auth-constants';
	import { authRequest, AuthAPIError } from '$lib/client/auth-api';
	import { createWebAuthnAssertion, isWebAuthnCancellation } from '$lib/client/webauthn';
	import AuthCard from '$lib/components/auth-card.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as InputOTP from '$lib/components/ui/input-otp/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import type { AuthModalView, ClientAuthState } from '$lib/types/auth';

	interface Props {
		auth: ClientAuthState;
		onComplete: (next: AuthModalView | null) => void | Promise<void>;
	}

	let { auth, onComplete }: Props = $props();
	let password = $state('');
	let code = $state('');
	let message = $state('');
	let pending = $state(false);

	async function submitPassword(event: SubmitEvent) {
		event.preventDefault();
		await submit('/api/auth/reauth', 'POST', new FormData(event.currentTarget as HTMLFormElement));
	}

	async function submitTOTP(event: SubmitEvent) {
		event.preventDefault();
		await submit('/api/auth/reauth', 'PUT', new FormData(event.currentTarget as HTMLFormElement));
	}

	async function submit(endpoint: string, method: string, body?: BodyInit) {
		message = '';
		pending = true;
		try {
			await authRequest(endpoint, { method, body });
			await onComplete(null);
		} catch (cause) {
			if (cause instanceof AuthAPIError && cause.modal) {
				await onComplete(cause.modal);
				return;
			}
			message = cause instanceof Error ? cause.message : 'Unable to confirm your identity';
		} finally {
			pending = false;
		}
	}

	async function submitPasskey() {
		message = '';
		pending = true;
		try {
			const assertion = await createWebAuthnAssertion('settings-reauth');
			await authRequest('/api/auth/reauth/passkey', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(assertion)
			});
			await onComplete(null);
		} catch (cause) {
			if (isWebAuthnCancellation(cause)) {
				message = 'Passkey verification was cancelled.';
			} else if (cause instanceof AuthAPIError && cause.modal) {
				await onComplete(cause.modal);
			} else {
				message = cause instanceof Error ? cause.message : 'Unable to confirm your identity';
			}
		} finally {
			pending = false;
		}
	}
</script>

<AuthCard>
	<Card.Header class="items-center text-center">
		<div class="mb-2 flex size-11 items-center justify-center rounded-full bg-muted">
			<ShieldCheckIcon class="size-5" />
		</div>
		<Card.Title>Confirm it’s you</Card.Title>
		<Card.Description>This is a sensitive change. Re-authenticate to continue.</Card.Description>
	</Card.Header>
	<Card.Content class="space-y-4">
		{#if message}
			<p
				class="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
				role="alert"
			>
				{message}
			</p>
		{/if}

		{#if !auth.user.registeredTOTP && !auth.user.registeredPasskey}
			<form onsubmit={submitPassword}>
				<Field.Group>
					<Field.Field>
						<Field.Label for="reauth-password">Current password</Field.Label>
						<Input
							id="reauth-password"
							name="password"
							type="password"
							bind:value={password}
							autocomplete="current-password"
							maxlength={MAX_PASSWORD_LENGTH}
							disabled={pending}
							required
						/>
					</Field.Field>
					<Button type="submit" class="w-full" disabled={pending || !password}>
						{#if pending}<LoaderCircleIcon class="animate-spin" />{/if}
						Confirm with password
					</Button>
				</Field.Group>
			</form>
		{:else if auth.user.registeredTOTP}
			<form onsubmit={submitTOTP}>
				<Field.Group>
					<Field.Field class="items-center">
						<Field.Label for="reauth-code" class="sr-only">Authenticator code</Field.Label>
						<InputOTP.Root
							id="reauth-code"
							maxlength={TOTP_CODE_LENGTH}
							class="justify-center"
							bind:value={code}
							disabled={pending}
							required
						>
							{#snippet children({ cells })}
								<InputOTP.Group>
									{#each cells as cell (cell)}<InputOTP.Slot {cell} />{/each}
								</InputOTP.Group>
							{/snippet}
						</InputOTP.Root>
						<input type="hidden" name="code" value={code} />
					</Field.Field>
					<Button
						type="submit"
						class="w-full"
						disabled={pending || code.length !== TOTP_CODE_LENGTH}
					>
						{#if pending}<LoaderCircleIcon class="animate-spin" />{/if}
						Confirm authenticator code
					</Button>
				</Field.Group>
			</form>
		{/if}

		{#if auth.user.registeredPasskey}
			{#if auth.user.registeredTOTP}
				<div class="flex items-center gap-3">
					<Separator class="flex-1" />
					<span class="text-xs text-muted-foreground">or</span>
					<Separator class="flex-1" />
				</div>
			{/if}
			<Button variant="outline" class="w-full" disabled={pending} onclick={submitPasskey}>
				{#if pending}<LoaderCircleIcon class="animate-spin" />{:else}<FingerprintIcon />{/if}
				Confirm with passkey
			</Button>
		{/if}
	</Card.Content>
</AuthCard>
