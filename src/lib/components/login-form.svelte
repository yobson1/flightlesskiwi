<script lang="ts">
	import FingerprintIcon from '@lucide/svelte/icons/fingerprint';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import { MAX_EMAIL_LENGTH, MAX_PASSWORD_LENGTH } from '$lib/auth-constants';
	import { authFormRequest, authRequest, AuthAPIError } from '$lib/client/auth-api';
	import { createWebAuthnAssertion, isWebAuthnCancellation } from '$lib/client/webauthn';
	import AuthCard from '$lib/components/auth-card.svelte';
	import AuthSidePanel from '$lib/components/auth-side-panel.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { cn } from '$lib/utils.js';
	import type { AuthModalView } from '$lib/types/auth';
	import type { HTMLAttributes } from 'svelte/elements';

	interface Props extends HTMLAttributes<HTMLDivElement> {
		onSwitchToSignup?: () => void;
		onForgotPassword?: () => void;
		onComplete?: (next: AuthModalView | null) => void | Promise<void>;
	}

	let {
		class: className,
		onSwitchToSignup,
		onForgotPassword,
		onComplete,
		...restProps
	}: Props = $props();

	const id = $props.id();
	let email = $state('');
	let password = $state('');
	let message = $state('');
	let pending = $state(false);
	let passkeyPending = $state(false);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		message = '';
		pending = true;
		try {
			const result = await authFormRequest(
				'/api/auth/login',
				new FormData(event.currentTarget as HTMLFormElement)
			);
			await onComplete?.(result.next);
		} catch (cause) {
			if (cause instanceof AuthAPIError && cause.modal) await onComplete?.(cause.modal);
			message = cause instanceof Error ? cause.message : 'Unable to sign in';
		} finally {
			pending = false;
		}
	}

	async function signInWithPasskey() {
		message = '';
		passkeyPending = true;
		try {
			const assertion = await createWebAuthnAssertion('passkey-login');
			const result = await authRequest('/api/auth/login/passkey', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(assertion)
			});
			await onComplete?.(result.next);
		} catch (cause) {
			if (isWebAuthnCancellation(cause)) {
				message = 'Passkey sign-in was cancelled.';
			} else {
				message = cause instanceof Error ? cause.message : 'Unable to sign in with a passkey';
			}
		} finally {
			passkeyPending = false;
		}
	}
</script>

<div class={cn('flex flex-col gap-6', className)} {...restProps}>
	<AuthCard formSubmit={submit}>
		<Field.Group>
			<div class="flex flex-col items-center gap-2 text-center">
				<h2 class="text-2xl font-bold">Welcome back</h2>
				<p class="text-balance text-muted-foreground">Sign in to continue to flightlesskiwi</p>
			</div>

			{#if message}
				<p
					class="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
					role="alert"
				>
					{message}
				</p>
			{/if}

			<Field.Field>
				<Field.Label for="login-email-{id}">Email</Field.Label>
				<Input
					id="login-email-{id}"
					name="email"
					type="email"
					bind:value={email}
					placeholder="you@example.com"
					autocomplete="email"
					maxlength={MAX_EMAIL_LENGTH}
					disabled={pending || passkeyPending}
					required
				/>
			</Field.Field>
			<Field.Field>
				<div class="flex items-center justify-between gap-3">
					<Field.Label for="login-password-{id}">Password</Field.Label>
					<button
						type="button"
						class="text-sm font-medium underline underline-offset-4 hover:text-primary"
						onclick={onForgotPassword}
					>
						Forgot password?
					</button>
				</div>
				<Input
					id="login-password-{id}"
					name="password"
					type="password"
					bind:value={password}
					autocomplete="current-password"
					maxlength={MAX_PASSWORD_LENGTH}
					disabled={pending || passkeyPending}
					required
				/>
			</Field.Field>
			<Field.Field>
				<Button type="submit" size="lg" class="w-full" disabled={pending || passkeyPending}>
					{#if pending}
						<LoaderCircleIcon class="animate-spin" />
						Signing in…
					{:else}
						Sign in
					{/if}
				</Button>
			</Field.Field>
			<Field.Separator class="*:data-[slot=field-separator-content]:bg-card">
				Or use a passkey
			</Field.Separator>
			<Field.Field>
				<Button
					variant="outline"
					type="button"
					size="lg"
					class="w-full"
					disabled={pending || passkeyPending}
					onclick={signInWithPasskey}
				>
					{#if passkeyPending}
						<LoaderCircleIcon class="animate-spin" />
						Waiting for passkey…
					{:else}
						<FingerprintIcon />
						Sign in with a passkey
					{/if}
				</Button>
			</Field.Field>
			<Field.Separator class="*:data-[slot=field-separator-content]:bg-card">
				OAuth providers coming soon
			</Field.Separator>
			<Field.Field class="grid grid-cols-3 gap-4">
				<Button variant="outline" type="button" disabled aria-label="Apple sign-in coming soon">
					<span aria-hidden="true" class="font-semibold">A</span>
				</Button>
				<Button variant="outline" type="button" disabled aria-label="Google sign-in coming soon">
					<span aria-hidden="true" class="font-semibold">G</span>
				</Button>
				<Button variant="outline" type="button" disabled aria-label="Meta sign-in coming soon">
					<span aria-hidden="true" class="font-semibold">M</span>
				</Button>
			</Field.Field>
			<Field.Description class="text-center">
				Don&apos;t have an account?
				<button
					type="button"
					class="font-medium text-foreground underline underline-offset-4 hover:text-primary"
					onclick={onSwitchToSignup}
				>
					Sign up
				</button>
			</Field.Description>
		</Field.Group>

		{#snippet side()}
			<AuthSidePanel />
		{/snippet}
	</AuthCard>
</div>
