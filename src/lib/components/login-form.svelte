<script lang="ts">
	import FingerprintIcon from '@lucide/svelte/icons/fingerprint';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import { enhance } from '$app/forms';
	import { createWebAuthnAssertion } from '$lib/client/webauthn';
	import favicon from '$lib/assets/favicon.svg';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { cn } from '$lib/utils.js';
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { HTMLAttributes } from 'svelte/elements';

	interface Props extends HTMLAttributes<HTMLDivElement> {
		onSwitchToSignup?: () => void;
		onRedirect?: (location: string) => void | Promise<void>;
	}

	let { class: className, onSwitchToSignup, onRedirect, ...restProps }: Props = $props();

	const id = $props.id();
	let message = $state('');
	let pending = $state(false);
	let passkeyPending = $state(false);

	const submit: SubmitFunction = () => {
		message = '';
		pending = true;

		return async ({ result }) => {
			pending = false;
			if (result.type === 'failure') {
				message = getActionMessage(result.data, 'Unable to sign in');
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

	async function signInWithPasskey() {
		message = '';
		passkeyPending = true;
		try {
			const assertion = await createWebAuthnAssertion('passkey-login');
			const response = await fetch('/login/passkey', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(assertion)
			});
			if (!response.ok) {
				throw new Error(await response.text());
			}
			const data = (await response.json()) as { redirect?: unknown };
			if (typeof data.redirect !== 'string') {
				throw new Error('Invalid login response');
			}
			await onRedirect?.(data.redirect);
		} catch (cause) {
			if (cause instanceof DOMException && cause.name === 'NotAllowedError') {
				message = 'Passkey sign-in was cancelled.';
			} else {
				message = cause instanceof Error ? cause.message : 'Unable to sign in with a passkey';
			}
		} finally {
			passkeyPending = false;
		}
	}

	function getActionMessage(data: unknown, fallback: string): string {
		if (typeof data === 'object' && data !== null && 'message' in data) {
			const value = data.message;
			if (typeof value === 'string') return value;
		}
		return fallback;
	}
</script>

<div class={cn('flex flex-col gap-6', className)} {...restProps}>
	<Card.Root class="overflow-hidden p-0">
		<Card.Content class="grid p-0 md:grid-cols-2">
			<form method="POST" action="/login" class="p-6 md:p-8" use:enhance={submit}>
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
							placeholder="you@example.com"
							autocomplete="email"
							disabled={pending || passkeyPending}
							required
						/>
					</Field.Field>
					<Field.Field>
						<Field.Label for="login-password-{id}">Password</Field.Label>
						<Input
							id="login-password-{id}"
							name="password"
							type="password"
							autocomplete="current-password"
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
						<Button
							variant="outline"
							type="button"
							disabled
							aria-label="Google sign-in coming soon"
						>
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
			</form>

			<div
				class="relative hidden min-h-full overflow-hidden border-l bg-[radial-gradient(circle_at_top_right,var(--color-primary),transparent_55%),linear-gradient(145deg,var(--color-muted),var(--color-background))] md:flex md:flex-col md:justify-between"
				aria-hidden="true"
			>
				<div
					class="absolute -top-16 -right-16 size-56 rounded-full border border-foreground/10"
				></div>
				<div
					class="absolute right-12 bottom-12 size-32 rounded-full border border-foreground/10"
				></div>
				<div class="relative flex items-center gap-3 p-8">
					<img src={favicon} alt="" class="size-10" />
					<span class="text-lg font-semibold">flightlesskiwi</span>
				</div>
				<p class="relative max-w-xs p-8 text-lg leading-relaxed font-medium text-balance">
					Your game library, benchmarks, and discoveries—all in one place.
				</p>
			</div>
		</Card.Content>
	</Card.Root>
</div>
