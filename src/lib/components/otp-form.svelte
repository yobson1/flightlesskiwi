<script lang="ts">
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import MailCheckIcon from '@lucide/svelte/icons/mail-check';
	import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as InputOTP from '$lib/components/ui/input-otp/index.js';
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { ComponentProps } from 'svelte';

	interface Props extends ComponentProps<typeof Card.Root> {
		kind?: 'email' | 'totp' | 'login-totp';
		email?: string;
		onBack?: () => void;
		onRedirect?: (location: string) => void | Promise<void>;
	}

	let { kind = 'email', email, onBack, onRedirect, ...props }: Props = $props();

	let code = $state('');
	let message = $state('');
	let resendMessage = $state('');
	let pending = $state(false);
	let resendPending = $state(false);
	let usingRecoveryCode = $state(false);

	const codeLength = $derived(kind === 'email' ? 8 : 6);
	const action = $derived(
		usingRecoveryCode
			? kind === 'login-totp'
				? '/login?/recovery'
				: '/2fa/reset'
			: kind === 'email'
				? '/verify-email?/verify'
				: kind === 'login-totp'
					? '/login?/totp'
					: '/2fa/totp'
	);

	onMount(() => {
		if (kind !== 'email') return;
		const controller = new AbortController();
		void ensureEmailVerificationRequest(controller.signal);
		return () => controller.abort();
	});

	async function ensureEmailVerificationRequest(signal: AbortSignal) {
		try {
			const response = await fetch('/api/auth/email-verification', {
				method: 'POST',
				signal
			});
			if (!response.ok) {
				resendMessage =
					(await response.text()) ||
					'We could not send a verification email. Use “Send another code” to try again.';
				return;
			}
			const data = (await response.json()) as { sent?: unknown };
			if (data.sent === true) {
				resendMessage = 'A verification code was sent to your inbox.';
			}
		} catch (cause) {
			if (cause instanceof DOMException && cause.name === 'AbortError') return;
			resendMessage =
				'We could not prepare email verification. Use “Send another code” to try again.';
		}
	}

	const submit: SubmitFunction = () => {
		message = '';
		pending = true;

		return async ({ result }) => {
			pending = false;
			if (result.type === 'failure') {
				message = getActionMessage(result.data, 'Unable to verify that code');
				return;
			}
			if (result.type === 'redirect') {
				await onRedirect?.(result.location);
				return;
			}
			if (result.type === 'error') {
				message = 'Something went wrong. Please try again.';
			}
		};
	};

	function toggleRecoveryCode() {
		usingRecoveryCode = !usingRecoveryCode;
		code = '';
		message = '';
	}

	const resend: SubmitFunction = () => {
		resendMessage = '';
		resendPending = true;

		return ({ result }) => {
			resendPending = false;
			if (result.type === 'success') {
				resendMessage = getActionMessage(result.data, 'A new code was sent.');
			} else if (result.type === 'failure') {
				resendMessage = getActionMessage(result.data, 'Unable to resend the code');
			} else {
				resendMessage = 'Unable to resend the code';
			}
		};
	};

	function getActionMessage(data: unknown, fallback: string): string {
		if (typeof data !== 'object' || data === null) return fallback;
		if ('message' in data && typeof data.message === 'string') return data.message;
		for (const value of Object.values(data)) {
			if (typeof value === 'object' && value !== null && 'message' in value) {
				const nestedMessage = value.message;
				if (typeof nestedMessage === 'string') return nestedMessage;
			}
		}
		return fallback;
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
		<form method="POST" {action} use:enhance={submit}>
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
			<form method="POST" action="/verify-email?/resend" class="mt-4" use:enhance={resend}>
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
			<form method="POST" action="/logout" class="mt-3 text-center">
				<button
					type="submit"
					class="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
				>
					Log out
				</button>
			</form>
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
