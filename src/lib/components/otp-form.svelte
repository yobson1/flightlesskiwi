<script lang="ts">
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import MailCheckIcon from '@lucide/svelte/icons/mail-check';
	import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
	import { onMount } from 'svelte';
	import { authRequest, AuthAPIError } from '$lib/client/auth-api';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as InputOTP from '$lib/components/ui/input-otp/index.js';
	import type { ComponentProps } from 'svelte';
	import type { AuthModalView } from '$lib/types/auth';

	interface Props extends ComponentProps<typeof Card.Root> {
		kind?: 'email' | 'totp' | 'login-totp';
		email?: string;
		onBack?: () => void;
		onComplete?: (next: AuthModalView | null) => void | Promise<void>;
	}

	let { kind = 'email', email, onBack, onComplete, ...props }: Props = $props();

	let code = $state('');
	let message = $state('');
	let resendMessage = $state('');
	let pending = $state(false);
	let resendPending = $state(false);
	let usingRecoveryCode = $state(false);

	const codeLength = $derived(kind === 'email' ? 8 : 6);
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
			if ('sent' in result && result.sent === true) {
				resendMessage = 'A verification code was sent to your inbox.';
			}
		} catch (cause) {
			if (cause instanceof DOMException && cause.name === 'AbortError') return;
			if (cause instanceof AuthAPIError && cause.modal) {
				await onComplete?.(cause.modal);
				return;
			}
			resendMessage =
				'We could not prepare email verification. Use “Send another code” to try again.';
		}
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		message = '';
		pending = true;
		try {
			const formData = new FormData(event.currentTarget as HTMLFormElement);
			const endpoint =
				kind === 'email'
					? '/api/auth/email-verification'
					: kind === 'login-totp'
						? '/api/auth/login'
						: '/api/auth/totp-verification';
			const method = usingRecoveryCode
				? 'PATCH'
				: kind === 'email'
					? 'PUT'
					: kind === 'login-totp'
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

	function toggleRecoveryCode() {
		usingRecoveryCode = !usingRecoveryCode;
		code = '';
		message = '';
	}

	async function resend(event: SubmitEvent) {
		event.preventDefault();
		resendMessage = '';
		resendPending = true;
		try {
			const result = await authRequest('/api/auth/email-verification', { method: 'PATCH' });
			resendMessage = result.message ?? 'A new code was sent.';
		} catch (cause) {
			if (cause instanceof AuthAPIError && cause.modal) {
				await onComplete?.(cause.modal);
				return;
			}
			resendMessage = cause instanceof Error ? cause.message : 'Unable to resend the code';
		} finally {
			resendPending = false;
		}
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

<Card.Root {...props}>
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
				Enter the eight-character code sent to {email ?? 'your email'}.
			{:else if usingRecoveryCode}
				Enter the recovery code you saved when you set up two-factor authentication.
			{:else}
				Enter the six-digit code from your authenticator app.
			{/if}
		</Card.Description>
	</Card.Header>
	<Card.Content>
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
							maxlength={64}
							disabled={pending}
							aria-invalid={message ? 'true' : undefined}
							required
						/>
					{:else}
						<InputOTP.Root
							maxlength={codeLength}
							id="otp-code"
							class="justify-center"
							bind:value={code}
							disabled={pending}
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

		{#if kind === 'email'}
			<form class="mt-4" onsubmit={resend}>
				<p class="text-center text-sm text-muted-foreground">
					Didn&apos;t receive it?
					<button
						type="submit"
						class="font-medium text-foreground underline underline-offset-4 hover:text-primary disabled:opacity-50"
						disabled={resendPending}
					>
						{resendPending ? 'Sending…' : 'Send another code'}
					</button>
				</p>
				{#if resendMessage}
					<p class="mt-2 text-center text-sm text-muted-foreground" aria-live="polite">
						{resendMessage}
					</p>
				{/if}
			</form>
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
		{:else}
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
		{#if kind === 'login-totp'}
			<button
				type="button"
				class="mt-3 w-full text-center text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
				onclick={onBack}
			>
				Back to sign in
			</button>
		{/if}
	</Card.Content>
</Card.Root>
