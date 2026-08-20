<script lang="ts">
	import FingerprintIcon from '@lucide/svelte/icons/fingerprint';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import MailCheckIcon from '@lucide/svelte/icons/mail-check';
	import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
	import { onMount } from 'svelte';
	import {
		EMAIL_CODE_LENGTH,
		EMAIL_CODE_LENGTH_WORD,
		EMAIL_CODE_SEND_INTERVAL_SECONDS,
		MAX_RECOVERY_CODE_LENGTH,
		TOTP_CODE_LENGTH,
		TOTP_CODE_LENGTH_WORD
	} from '#lib/auth-constants.js';
	import { authRequest, AuthAPIError, computeResendAvailableAt } from '#lib/client/auth-api.js';
	import { formDataFromSubmitEvent } from '#lib/client/forms.js';
	import { createWebAuthnAssertion, parseWebAuthnCancellation } from '#lib/client/webauthn.js';
	import AuthCard from '#lib/components/auth-card.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as InputOTP from '#lib/components/ui/input-otp/index.js';
	import ResendCodeButton from '#lib/components/resend-code-button.svelte';
	import type { ComponentProps } from 'svelte';
	import type { AuthModalView } from '#lib/types/auth.js';

	interface Props extends ComponentProps<typeof Card.Root> {
		kind?: 'email' | 'login-2fa' | 'password-reset';
		email?: string;
		totpAvailable?: boolean;
		passkeyAvailable?: boolean;
		onBack?: () => void;
		onComplete?: (next: AuthModalView | null) => void | Promise<void>;
	}

	let {
		kind = 'email',
		email,
		totpAvailable = true,
		passkeyAvailable = false,
		onBack,
		onComplete,
		...props
	}: Props = $props();

	let code = $state('');
	let message = $state('');
	let resendMessage = $state('');
	let pending = $state(false);
	let passkeyPending = $state(false);
	let resendPending = $state(false);
	let resendAvailableAt = $state(0);
	let usingRecoveryCode = $state(false);

	const codeLength = $derived(kind === 'email' ? EMAIL_CODE_LENGTH : TOTP_CODE_LENGTH);
	onMount(() => {
		if (kind !== 'email') return;
		const controller = new AbortController();
		void ensureEmailVerificationRequest(controller.signal);
		return () => controller.abort();
	});

	async function ensureEmailVerificationRequest(signal: AbortSignal) {
		try {
			const result = await authRequest('/api/auth/email-verification', {
				method: 'POST',
				signal
			});
			if (result.sent === true) {
				resendMessage = 'A verification code was sent to your inbox.';
			}
			setResendAvailability(result);
		} catch (cause) {
			if (cause instanceof DOMException && cause.name === 'AbortError') return;
			if (cause instanceof AuthAPIError && cause.modal) {
				await onComplete?.(cause.modal);
				return;
			}
			if (cause instanceof AuthAPIError) setResendAvailability(cause);
			resendMessage =
				'We could not prepare email verification. Use “Send another code” to try again.';
		}
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		message = '';
		pending = true;
		try {
			const formData = formDataFromSubmitEvent(event);
			if (kind === 'password-reset') {
				formData.set('step', usingRecoveryCode ? 'recovery-code' : 'totp');
			}
			const endpoint =
				kind === 'email'
					? '/api/auth/email-verification'
					: kind === 'login-2fa'
						? '/api/auth/login'
						: '/api/auth/password-reset';
			const method =
				kind === 'password-reset'
					? 'POST'
					: usingRecoveryCode
						? 'PATCH'
						: kind === 'email' || kind === 'login-2fa'
							? 'PUT'
							: 'POST';
			const result = await authRequest(endpoint, { method, body: formData });
			await onComplete?.(result.next);
		} catch (cause) {
			if (cause instanceof AuthAPIError && cause.modal) await onComplete?.(cause.modal);
			message = cause instanceof Error ? cause.message : 'Unable to verify that code';
		} finally {
			pending = false;
		}
	}

	async function submitPasskey() {
		message = '';
		passkeyPending = true;
		try {
			const assertion = await createWebAuthnAssertion('passkey-2fa');
			const result = await authRequest('/api/auth/login/passkey', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(assertion)
			});
			await onComplete?.(result.next);
		} catch (cause) {
			if (parseWebAuthnCancellation(cause) !== null) {
				message = 'Passkey verification was cancelled.';
			} else if (cause instanceof AuthAPIError && cause.modal) {
				await onComplete?.(cause.modal);
			} else {
				message = cause instanceof Error ? cause.message : 'Unable to verify your passkey';
			}
		} finally {
			passkeyPending = false;
		}
	}

	function toggleRecoveryCode() {
		usingRecoveryCode = !usingRecoveryCode;
		code = '';
		message = '';
	}

	async function resend() {
		resendMessage = '';
		resendPending = true;
		try {
			const result = await authRequest('/api/auth/email-verification', { method: 'PATCH' });
			resendMessage = result.message ?? 'A new code was sent.';
			setResendAvailability(result);
		} catch (cause) {
			if (cause instanceof AuthAPIError && cause.modal) {
				await onComplete?.(cause.modal);
				return;
			}
			if (cause instanceof AuthAPIError) setResendAvailability(cause);
			resendMessage = cause instanceof Error ? cause.message : 'Unable to resend the code';
		} finally {
			resendPending = false;
		}
	}

	function setResendAvailability(value: { retryAfterSeconds?: number }) {
		resendAvailableAt = computeResendAvailableAt(value, EMAIL_CODE_SEND_INTERVAL_SECONDS);
	}

	async function logout() {
		try {
			const result = await authRequest('/api/auth/logout', { method: 'POST' });
			await onComplete?.(result.next);
		} catch (cause) {
			message = cause instanceof Error ? cause.message : 'Unable to log out';
		}
	}
</script>

{#snippet codeForm()}
	<form onsubmit={submit}>
		<Field.Group>
			<Field.Field class="items-center">
				<Field.Label for="otp-code" class="sr-only">Verification code</Field.Label>
				{#if usingRecoveryCode}
					<Input
						id="otp-code"
						name="code"
						type="text"
						class="font-mono uppercase"
						bind:value={code}
						autocomplete="one-time-code"
						autocapitalize="characters"
						spellcheck={false}
						maxlength={MAX_RECOVERY_CODE_LENGTH}
						disabled={pending || passkeyPending}
						aria-invalid={message ? 'true' : undefined}
						required
					/>
				{:else}
					<InputOTP.Root
						maxlength={codeLength}
						id="otp-code"
						class="justify-center"
						bind:value={code}
						disabled={pending || passkeyPending}
						aria-invalid={message ? 'true' : undefined}
						required
					>
						{#snippet children({ cells })}
							<InputOTP.Group
								class="gap-1 *:data-[slot=input-otp-slot]:size-8 *:data-[slot=input-otp-slot]:rounded-md *:data-[slot=input-otp-slot]:border sm:gap-1.5 sm:*:data-[slot=input-otp-slot]:size-9"
							>
								{#each cells as cell (cell)}
									<InputOTP.Slot {cell} />
								{/each}
							</InputOTP.Group>
						{/snippet}
					</InputOTP.Root>
					<input type="hidden" name="code" value={kind === 'email' ? code.toUpperCase() : code} />
				{/if}
				{#if message}
					<Field.Error>{message}</Field.Error>
				{/if}
			</Field.Field>
			<Button
				type="submit"
				size="lg"
				class="w-full"
				disabled={pending ||
					passkeyPending ||
					(usingRecoveryCode ? code.trim().length === 0 : code.length !== codeLength)}
			>
				{#if pending}
					<LoaderCircleIcon class="animate-spin" />
					Verifying…
				{:else}
					{usingRecoveryCode ? 'Recover account' : 'Verify'}
				{/if}
			</Button>
		</Field.Group>
	</form>
{/snippet}

<AuthCard {...props}>
	<Card.Header>
		<div class="grid grid-cols-[2.25rem_1fr_2.25rem] items-center gap-2">
			<div class="flex size-9 items-center justify-center rounded-full bg-muted">
				{#if kind === 'email'}
					<MailCheckIcon class="size-4" />
				{:else}
					<ShieldCheckIcon class="size-4" />
				{/if}
			</div>
			<Card.Title class="text-center">
				{kind === 'email' ? 'Verify your email' : 'Two-factor authentication'}
			</Card.Title>
			<span aria-hidden="true"></span>
		</div>
		<Card.Description class="text-center text-balance">
			{#if kind === 'email'}
				Enter the {EMAIL_CODE_LENGTH_WORD}-character code sent to {email ?? 'your email'}.
			{:else if usingRecoveryCode}
				Enter the recovery code you saved when you set up two-factor authentication.
			{:else if kind === 'login-2fa' && !totpAvailable}
				Continue with a passkey registered to your account.
			{:else}
				Enter the {TOTP_CODE_LENGTH_WORD}-digit code from your authenticator app.
			{/if}
		</Card.Description>
	</Card.Header>
	<Card.Content>
		{#if kind === 'login-2fa' && !totpAvailable && message}
			<p
				class="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
				role="alert"
			>
				{message}
			</p>
		{/if}
		{#if kind === 'login-2fa'}
			{#if totpAvailable}
				{@render codeForm()}
			{/if}
			{#if passkeyAvailable}
				{#if totpAvailable}
					<div class="my-4 flex items-center gap-3">
						<div class="h-px flex-1 bg-border"></div>
						<span class="text-xs text-muted-foreground">or</span>
						<div class="h-px flex-1 bg-border"></div>
					</div>
				{/if}
				<Button
					variant="outline"
					type="button"
					size="lg"
					class="w-full"
					disabled={pending || passkeyPending}
					onclick={submitPasskey}
				>
					{#if passkeyPending}
						<LoaderCircleIcon class="animate-spin" />
						Waiting for passkey…
					{:else}
						<FingerprintIcon />
						Verify with passkey
					{/if}
				</Button>
			{/if}
		{:else}
			{@render codeForm()}
		{/if}

		{#if kind === 'email'}
			<div class="mt-4">
				<p class="text-center text-sm text-muted-foreground">
					Didn&apos;t receive it?
					<ResendCodeButton
						availableAt={resendAvailableAt}
						pending={resendPending}
						onclick={resend}
					/>
				</p>
				{#if resendMessage}
					<p class="mt-2 text-center text-sm text-muted-foreground" aria-live="polite">
						{resendMessage}
					</p>
				{/if}
			</div>
		{/if}
		{#if kind === 'email'}
			<div class="mt-3 text-center">
				<button
					type="button"
					class="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
					onclick={logout}
				>
					Log out
				</button>
			</div>
		{:else if kind !== 'login-2fa' || totpAvailable}
			<button
				type="button"
				class="mt-4 w-full text-center text-sm font-medium underline underline-offset-4 {usingRecoveryCode
					? 'text-foreground hover:text-primary'
					: 'text-destructive hover:text-destructive/80'}"
				onclick={toggleRecoveryCode}
			>
				{usingRecoveryCode
					? 'Use an authenticator code instead'
					: 'Lost your authenticator? Use your recovery code'}
			</button>
		{/if}
		{#if kind === 'login-2fa' || kind === 'password-reset'}
			<button
				type="button"
				class="mt-3 w-full text-center text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
				onclick={onBack}
			>
				{kind === 'login-2fa' ? 'Back to sign in' : 'Back to verification options'}
			</button>
		{/if}
	</Card.Content>
</AuthCard>
