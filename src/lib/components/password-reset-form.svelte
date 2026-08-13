<script lang="ts">
	import FingerprintIcon from '@lucide/svelte/icons/fingerprint';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import MailCheckIcon from '@lucide/svelte/icons/mail-check';
	import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
	import {
		EMAIL_CODE_LENGTH,
		EMAIL_CODE_LENGTH_WORD,
		EMAIL_CODE_SEND_INTERVAL_SECONDS,
		MAX_EMAIL_LENGTH,
		MAX_PASSWORD_LENGTH,
		MIN_PASSWORD_LENGTH
	} from '$lib/auth-constants';
	import { authRequest, AuthAPIError, computeResendAvailableAt } from '$lib/client/auth-api';
	import { createWebAuthnAssertion, isWebAuthnCancellation } from '$lib/client/webauthn';
	import AuthCard from '$lib/components/auth-card.svelte';
	import OTPForm from '$lib/components/otp-form.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as InputOTP from '$lib/components/ui/input-otp/index.js';
	import ResendCodeButton from '$lib/components/resend-code-button.svelte';
	import type { AuthAPIResponse, AuthModalView, PasswordResetStage } from '$lib/types/auth';

	interface Props {
		initialState?: AuthAPIResponse | null;
		onBack?: () => void | Promise<void>;
		onComplete?: (next: AuthModalView | null) => void | Promise<void>;
	}

	let { initialState, onBack, onComplete }: Props = $props();
	const id = $props.id();

	let stage = $state<PasswordResetStage>('request');
	let email = $state('');
	let code = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let registeredTOTP = $state(false);
	let registeredPasskey = $state(false);
	let message = $state('');
	let notice = $state('');
	let pending = $state(false);
	let passkeyPending = $state(false);
	let resendPending = $state(false);
	let resendAvailableAt = $state(0);
	let factorMode = $state<'choose' | 'authenticator'>('choose');

	$effect(() => {
		const nextState = readState(initialState);
		stage = nextState.stage;
		email = nextState.email;
		registeredTOTP = nextState.registeredTOTP;
		registeredPasskey = nextState.registeredPasskey;
		factorMode = 'choose';
		if (nextState.stage === 'email-code' && initialState) setResendAvailability(initialState);
	});

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		message = '';
		notice = '';
		if (stage === 'password' && password !== confirmPassword) {
			message = 'Passwords do not match';
			return;
		}

		pending = true;
		try {
			const formData = new FormData(event.currentTarget as HTMLFormElement);
			const result = await authRequest('/api/auth/password-reset', {
				method: 'POST',
				body: formData
			});
			if (result.next === null) {
				await onComplete?.(null);
				return;
			}
			applyState(result);
			if (formData.get('step') === 'request') setResendAvailability(result);
			code = '';
			password = '';
			confirmPassword = '';
			notice = result.message ?? '';
		} catch (cause) {
			if (cause instanceof AuthAPIError && cause.modal) {
				await onComplete?.(cause.modal);
				return;
			}
			message = cause instanceof Error ? cause.message : 'Unable to reset your password';
		} finally {
			pending = false;
		}
	}

	async function verifyWithPasskey() {
		message = '';
		notice = '';
		passkeyPending = true;
		try {
			const assertion = await createWebAuthnAssertion('password-reset-2fa');
			const result = await authRequest('/api/auth/password-reset/passkey', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(assertion)
			});
			applyState(result);
		} catch (cause) {
			if (isWebAuthnCancellation(cause)) {
				message = 'Passkey verification was cancelled.';
			} else {
				message = cause instanceof Error ? cause.message : 'Unable to verify your passkey';
			}
		} finally {
			passkeyPending = false;
		}
	}

	function applyState(value: AuthAPIResponse) {
		const nextState = readState(value);
		stage = nextState.stage;
		email = nextState.email || email;
		registeredTOTP = nextState.registeredTOTP;
		registeredPasskey = nextState.registeredPasskey;
		factorMode = 'choose';
	}

	function completeCodeFactor(next: AuthModalView | null) {
		if (next === 'password-reset') {
			stage = 'password';
			registeredTOTP = false;
			registeredPasskey = false;
			factorMode = 'choose';
			return;
		}
		void onComplete?.(next);
	}

	function startAgain() {
		stage = 'request';
		code = '';
		message = '';
		notice = '';
	}

	async function resendCode() {
		message = '';
		notice = '';
		resendPending = true;
		const formData = new FormData();
		formData.set('step', 'request');
		formData.set('email', email);
		try {
			const result = await authRequest('/api/auth/password-reset', {
				method: 'POST',
				body: formData
			});
			applyState(result);
			setResendAvailability(result);
			code = '';
			notice = result.message ?? 'A new reset code was sent.';
		} catch (cause) {
			if (cause instanceof AuthAPIError && cause.modal) {
				await onComplete?.(cause.modal);
				return;
			}
			if (cause instanceof AuthAPIError) setResendAvailability(cause);
			message = cause instanceof Error ? cause.message : 'Unable to resend the reset code';
		} finally {
			resendPending = false;
		}
	}

	function setResendAvailability(value: { retryAfterSeconds?: number }) {
		resendAvailableAt = computeResendAvailableAt(value, EMAIL_CODE_SEND_INTERVAL_SECONDS);
	}

	function readState(value: AuthAPIResponse | null | undefined): {
		stage: PasswordResetStage;
		email: string;
		registeredTOTP: boolean;
		registeredPasskey: boolean;
	} {
		if (value === null || value === undefined) {
			return {
				stage: 'request',
				email: '',
				registeredTOTP: false,
				registeredPasskey: false
			};
		}
		const parsedStage =
			value.stage === 'email-code' || value.stage === 'two-factor' || value.stage === 'password'
				? value.stage
				: 'request';
		return {
			stage: parsedStage,
			email: value.email ?? '',
			registeredTOTP: value.registeredTOTP === true,
			registeredPasskey: value.registeredPasskey === true
		};
	}
</script>

{#if stage === 'two-factor' && factorMode === 'authenticator'}
	<OTPForm
		kind="password-reset"
		onBack={() => (factorMode = 'choose')}
		onComplete={completeCodeFactor}
	/>
{:else}
	<AuthCard>
		<Card.Header class="items-center text-center">
			<div class="mb-2 flex size-11 items-center justify-center rounded-full bg-muted">
				{#if stage === 'request'}
					<KeyRoundIcon class="size-5" />
				{:else if stage === 'email-code'}
					<MailCheckIcon class="size-5" />
				{:else if stage === 'two-factor'}
					<ShieldCheckIcon class="size-5" />
				{:else}
					<KeyRoundIcon class="size-5" />
				{/if}
			</div>
			<Card.Title>
				{#if stage === 'request'}
					Reset your password
				{:else if stage === 'email-code'}
					Check your email
				{:else if stage === 'two-factor'}
					Two-factor authentication
				{:else}
					Choose a new password
				{/if}
			</Card.Title>
			<Card.Description class="text-balance">
				{#if stage === 'request'}
					Enter your account email and we’ll send you a reset code.
				{:else if stage === 'email-code'}
					Enter the {EMAIL_CODE_LENGTH_WORD}-character code sent to {email || 'your email'}.
				{:else if stage === 'two-factor'}
					Verify a second factor before changing your password.
				{:else}
					Use at least {MIN_PASSWORD_LENGTH} characters for your new password.
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
			{#if notice}
				<p
					class="mb-4 rounded-lg border border-border bg-muted/60 px-3 py-2 text-sm"
					aria-live="polite"
				>
					{notice}
				</p>
			{/if}

			{#if stage === 'request'}
				<form onsubmit={submit}>
					<input type="hidden" name="step" value="request" />
					<Field.Group>
						<Field.Field>
							<Field.Label for="password-reset-email-{id}">Email</Field.Label>
							<Input
								id="password-reset-email-{id}"
								name="email"
								type="email"
								bind:value={email}
								autocomplete="email"
								placeholder="you@example.com"
								maxlength={MAX_EMAIL_LENGTH}
								disabled={pending}
								required
							/>
						</Field.Field>
						<Button type="submit" size="lg" class="w-full" disabled={pending}>
							{#if pending}
								<LoaderCircleIcon class="animate-spin" />
								Sending code…
							{:else}
								Send reset code
							{/if}
						</Button>
					</Field.Group>
				</form>
				<button
					type="button"
					class="mt-4 w-full text-center text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
					onclick={onBack}
				>
					Back to sign in
				</button>
			{:else if stage === 'email-code'}
				<form onsubmit={submit}>
					<input type="hidden" name="step" value="email-code" />
					<input type="hidden" name="code" value={code.toUpperCase()} />
					<Field.Group>
						<Field.Field class="items-center">
							<Field.Label for="password-reset-code-{id}" class="sr-only">
								Password reset code
							</Field.Label>
							<InputOTP.Root
								maxlength={EMAIL_CODE_LENGTH}
								id="password-reset-code-{id}"
								class="justify-center"
								bind:value={code}
								disabled={pending}
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
						</Field.Field>
						<Button
							type="submit"
							size="lg"
							class="w-full"
							disabled={pending || code.length !== EMAIL_CODE_LENGTH}
						>
							{#if pending}
								<LoaderCircleIcon class="animate-spin" />
								Verifying…
							{:else}
								Verify code
							{/if}
						</Button>
					</Field.Group>
				</form>
				<div class="mt-4 space-y-2 text-center text-sm text-muted-foreground">
					<p>
						Didn&apos;t receive it?
						<ResendCodeButton
							availableAt={resendAvailableAt}
							pending={resendPending}
							onclick={resendCode}
						/>
					</p>
					<button
						type="button"
						class="underline underline-offset-4 hover:text-foreground"
						onclick={startAgain}
					>
						Use a different email
					</button>
				</div>
			{:else if stage === 'two-factor'}
				{#if registeredTOTP}
					<Button
						type="button"
						size="lg"
						class="h-auto w-full justify-start px-4 py-3 text-left"
						disabled={passkeyPending}
						onclick={() => (factorMode = 'authenticator')}
					>
						<KeyRoundIcon class="size-5" />
						<span class="flex flex-col items-start">
							<span>Use an authenticator code</span>
							<span class="text-xs font-normal opacity-75">
								You can also use your recovery code
							</span>
						</span>
					</Button>
				{/if}

				{#if registeredPasskey}
					<Button
						type="button"
						variant={registeredTOTP ? 'outline' : 'default'}
						size="lg"
						class="mt-3 h-auto w-full justify-start px-4 py-3 text-left"
						disabled={pending || passkeyPending}
						onclick={verifyWithPasskey}
					>
						{#if passkeyPending}
							<LoaderCircleIcon class="animate-spin" />
							<span>Waiting for passkey…</span>
						{:else}
							<FingerprintIcon />
							<span class="flex flex-col items-start">
								<span>Use a passkey</span>
								<span class="text-xs font-normal opacity-75">
									Verify with your device’s passkey prompt
								</span>
							</span>
						{/if}
					</Button>
				{/if}
			{:else}
				<form onsubmit={submit}>
					<input type="hidden" name="step" value="password" />
					<Field.Group>
						<Field.Field>
							<Field.Label for="password-reset-new-{id}">New password</Field.Label>
							<Input
								id="password-reset-new-{id}"
								name="password"
								type="password"
								bind:value={password}
								autocomplete="new-password"
								minlength={MIN_PASSWORD_LENGTH}
								maxlength={MAX_PASSWORD_LENGTH}
								disabled={pending}
								required
							/>
						</Field.Field>
						<Field.Field>
							<Field.Label for="password-reset-confirm-{id}">Confirm new password</Field.Label>
							<Input
								id="password-reset-confirm-{id}"
								name="confirmPassword"
								type="password"
								bind:value={confirmPassword}
								autocomplete="new-password"
								minlength={MIN_PASSWORD_LENGTH}
								maxlength={MAX_PASSWORD_LENGTH}
								disabled={pending}
								required
							/>
						</Field.Field>
						<Button type="submit" size="lg" class="w-full" disabled={pending}>
							{#if pending}
								<LoaderCircleIcon class="animate-spin" />
								Updating password…
							{:else}
								Update password
							{/if}
						</Button>
					</Field.Group>
				</form>
			{/if}
		</Card.Content>
	</AuthCard>
{/if}
