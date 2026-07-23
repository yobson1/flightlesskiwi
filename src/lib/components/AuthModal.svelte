<script lang="ts">
	import FingerprintIcon from '@lucide/svelte/icons/fingerprint';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import XIcon from '@lucide/svelte/icons/x';
	import { Dialog } from 'bits-ui';
	import { createWebAuthnAssertion } from '$lib/client/webauthn';
	import LoginForm from '$lib/components/login-form.svelte';
	import OTPForm from '$lib/components/otp-form.svelte';
	import PasskeySetupForm from '$lib/components/passkey-setup-form.svelte';
	import RecoveryCode from '$lib/components/recovery-code.svelte';
	import SignupForm from '$lib/components/signup-form.svelte';
	import TOTPSetupForm from '$lib/components/totp-setup-form.svelte';
	import TwoFactorSetup from '$lib/components/two-factor-setup.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { cn } from '$lib/utils.js';
	import type { AuthModalView, ClientAuthState } from '$lib/types/auth';

	interface Props {
		view?: AuthModalView | null;
		auth: ClientAuthState | null;
		webAuthnRPName: string;
		routeData?: unknown;
		onClose?: () => void | Promise<void>;
		onRedirect?: (location: string) => void | Promise<void>;
	}

	let {
		view = $bindable(null),
		auth,
		webAuthnRPName,
		routeData,
		onClose,
		onRedirect
	}: Props = $props();
	let passkeyPending = $state(false);
	let passkeyMessage = $state('');

	const wide = $derived(view === 'login' || view === 'signup');
	const required = $derived(view === 'verify-email');
	const totpKeyURI = $derived(getStringProperty(routeData, 'keyURI'));
	const passkeyOptions = $derived(getPasskeyOptions(routeData));
	const title = $derived.by(() => {
		switch (view) {
			case 'signup':
				return 'Create your account';
			case 'verify-email':
				return 'Verify your email';
			case 'setup':
				return 'Secure your account';
			case 'totp-setup':
				return 'Set up your authenticator';
			case 'passkey-register':
				return 'Create a passkey';
			case 'recovery-code':
				return 'Save your recovery code';
			case 'totp':
				return 'Two-factor authentication';
			case 'passkey':
				return 'Use your passkey';
			default:
				return 'Sign in';
		}
	});

	function switchView(nextView: AuthModalView) {
		passkeyMessage = '';
		view = nextView;
	}

	async function close() {
		view = null;
		await onClose?.();
	}

	async function verifyWithPasskey() {
		passkeyMessage = '';
		passkeyPending = true;
		try {
			const assertion = await createWebAuthnAssertion('passkey-2fa');
			const response = await fetch('/2fa/passkey', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(assertion)
			});
			if (!response.ok) {
				throw new Error(await response.text());
			}
			await onRedirect?.('/');
		} catch (cause) {
			if (cause instanceof DOMException && cause.name === 'NotAllowedError') {
				passkeyMessage = 'Passkey verification was cancelled.';
			} else {
				passkeyMessage = cause instanceof Error ? cause.message : 'Unable to verify your passkey';
			}
		} finally {
			passkeyPending = false;
		}
	}

	function getStringProperty(value: unknown, key: string): string | null {
		if (typeof value !== 'object' || value === null || !(key in value)) return null;
		const property = (value as Record<string, unknown>)[key];
		return typeof property === 'string' ? property : null;
	}

	function getPasskeyOptions(value: unknown): {
		username: string;
		credentialUserId: Uint8Array;
		excludedCredentialIds: Uint8Array[];
	} | null {
		if (typeof value !== 'object' || value === null) return null;
		const data = value as Record<string, unknown>;
		if (
			!(data.credentialUserId instanceof Uint8Array) ||
			typeof data.user !== 'object' ||
			data.user === null ||
			!('username' in data.user) ||
			typeof data.user.username !== 'string' ||
			!Array.isArray(data.credentials)
		) {
			return null;
		}
		const excludedCredentialIds: Uint8Array[] = [];
		for (const credential of data.credentials) {
			if (
				typeof credential === 'object' &&
				credential !== null &&
				'id' in credential &&
				credential.id instanceof Uint8Array
			) {
				excludedCredentialIds.push(credential.id);
			}
		}
		return {
			username: data.user.username,
			credentialUserId: data.credentialUserId,
			excludedCredentialIds
		};
	}
</script>

<Dialog.Root
	open={view !== null}
	onOpenChange={(open) => {
		if (!open && view !== null && !required) void close();
	}}
>
	<Dialog.Portal>
		<Dialog.Overlay
			class="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
		/>
		<Dialog.Content
			onEscapeKeydown={(event) => {
				if (required) event.preventDefault();
			}}
			onInteractOutside={(event) => {
				if (required) event.preventDefault();
			}}
			class={cn(
				'fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
				wide ? 'max-w-3xl' : 'max-w-sm'
			)}
		>
			<Dialog.Title class="sr-only">{title}</Dialog.Title>
			<Dialog.Description class="sr-only">
				Complete the requested authentication step without leaving the current page.
			</Dialog.Description>

			{#if !required}
				<Button
					variant="outline"
					size="icon"
					class="absolute top-4 right-4 z-10 rounded-full bg-background/90 shadow-sm backdrop-blur"
					aria-label="Close authentication dialog"
					onclick={close}
				>
					<XIcon />
				</Button>
			{/if}

			{#key view}
				{#if view === 'login'}
					<LoginForm onSwitchToSignup={() => switchView('signup')} {onRedirect} />
				{:else if view === 'signup'}
					<SignupForm onSwitchToLogin={() => switchView('login')} {onRedirect} />
				{:else if view === 'verify-email'}
					<OTPForm kind="email" email={auth?.user.email} {onRedirect} />
				{:else if view === 'setup'}
					<TwoFactorSetup
						registeredPasskey={auth?.user.registeredPasskey ?? false}
						registeredTOTP={auth?.user.registeredTOTP ?? false}
						onSelect={(location) => onRedirect?.(location)}
						onComplete={() => onRedirect?.('/')}
					/>
				{:else if view === 'totp-setup'}
					{#if totpKeyURI}
						<TOTPSetupForm keyURI={totpKeyURI} {onRedirect} />
					{:else}
						<Card.Root>
							<Card.Content class="flex items-center justify-center gap-2 py-12">
								<LoaderCircleIcon class="animate-spin" />
								Loading authenticator setup…
							</Card.Content>
						</Card.Root>
					{/if}
				{:else if view === 'passkey-register'}
					{#if passkeyOptions}
						<PasskeySetupForm
							rpName={webAuthnRPName}
							username={passkeyOptions.username}
							credentialUserId={passkeyOptions.credentialUserId}
							excludedCredentialIds={passkeyOptions.excludedCredentialIds}
							{onRedirect}
						/>
					{:else}
						<Card.Root>
							<Card.Content class="flex items-center justify-center gap-2 py-12">
								<LoaderCircleIcon class="animate-spin" />
								Loading passkey setup…
							</Card.Content>
						</Card.Root>
					{/if}
				{:else if view === 'recovery-code'}
					<RecoveryCode
						onDone={() => onRedirect?.(auth?.user.registeredPasskey ? '/' : '/2fa/setup')}
					/>
				{:else if view === 'totp'}
					<OTPForm kind="totp" {onRedirect} />
				{:else if view === 'passkey'}
					<Card.Root>
						<Card.Header class="items-center text-center">
							<div class="mb-2 flex size-11 items-center justify-center rounded-full bg-muted">
								<FingerprintIcon class="size-5" />
							</div>
							<Card.Title>Use your passkey</Card.Title>
							<Card.Description>
								Verify it&apos;s you with your device&apos;s passkey prompt.
							</Card.Description>
						</Card.Header>
						<Card.Content class="space-y-4">
							{#if passkeyMessage}
								<p
									class="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
									role="alert"
								>
									{passkeyMessage}
								</p>
							{/if}
							<Button
								size="lg"
								class="w-full"
								disabled={passkeyPending}
								onclick={verifyWithPasskey}
							>
								{#if passkeyPending}
									<LoaderCircleIcon class="animate-spin" />
									Waiting for passkey…
								{:else}
									<FingerprintIcon />
									Continue with passkey
								{/if}
							</Button>
							{#if auth?.user.registeredTOTP}
								<Button variant="ghost" class="w-full" onclick={() => switchView('totp')}>
									Use an authenticator code instead
								</Button>
							{/if}
						</Card.Content>
					</Card.Root>
				{/if}
			{/key}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
