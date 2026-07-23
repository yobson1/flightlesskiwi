<script lang="ts">
	import AlertTriangleIcon from '@lucide/svelte/icons/triangle-alert';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ClipboardIcon from '@lucide/svelte/icons/clipboard';
	import FingerprintIcon from '@lucide/svelte/icons/fingerprint';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import LockKeyholeIcon from '@lucide/svelte/icons/lock-keyhole';
	import MailIcon from '@lucide/svelte/icons/mail';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
	import SmartphoneIcon from '@lucide/svelte/icons/smartphone';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import UserRoundIcon from '@lucide/svelte/icons/user-round';
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { createWebAuthnAssertion } from '$lib/client/webauthn';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as InputOTP from '$lib/components/ui/input-otp/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import { toast } from 'svelte-sonner';
	import { onMount } from 'svelte';
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { PageProps } from './$types';

	type SettingsDestination = '/2fa/totp/setup' | '/2fa/passkey/register';

	let { data }: PageProps = $props();

	let recentlyReauthenticated = $derived(data.recentlyReauthenticated);
	let reauthOpen = $state(false);
	let reauthPassword = $state('');
	let reauthCode = $state('');
	let reauthMessage = $state('');
	let reauthPending = $state(false);
	let pendingContinuation = $state<(() => void) | null>(null);
	let recoveryCode = $state('');
	let copied = $state(false);
	let removeAuthenticatorOpen = $state(false);
	let removePasskeyId = $state<string | null>(null);
	let replaceRecoveryCodeOpen = $state(false);

	onMount(() => {
		if (data.reauthenticationDestination === null) return;
		const destination = data.reauthenticationDestination as SettingsDestination;
		if (recentlyReauthenticated) {
			void goto(resolve(destination));
			return;
		}
		requestReauthentication(() => void goto(resolve(destination)));
	});

	const reauthSubmit: SubmitFunction = () => {
		reauthMessage = '';
		reauthPending = true;
		return async ({ result }) => {
			reauthPending = false;
			if (result.type === 'success' && isReauthenticated(result.data)) {
				await finishReauthentication();
				return;
			}
			reauthMessage =
				result.type === 'failure'
					? getActionMessage(result.data, 'Unable to confirm your identity')
					: 'Unable to confirm your identity';
		};
	};

	function settingsSubmit(
		successMessage: string,
		onSuccess?: (data: unknown) => void
	): SubmitFunction {
		return ({ formElement, cancel }) => {
			if (!recentlyReauthenticated) {
				cancel();
				requestReauthentication(() => formElement.requestSubmit());
				return;
			}
			return async ({ result, update }) => {
				if (result.type === 'failure' && needsReauthentication(result.data)) {
					recentlyReauthenticated = false;
					requestReauthentication(() => formElement.requestSubmit());
					return;
				}
				if (result.type === 'failure') {
					toast.error(getActionMessage(result.data, 'Unable to update settings'));
				} else if (result.type === 'success') {
					onSuccess?.(result.data);
					toast.success(successMessage);
				}
				await update({
					reset: result.type === 'success',
					invalidateAll: result.type === 'success'
				});
			};
		};
	}

	function requestReauthentication(continuation: () => void) {
		pendingContinuation = continuation;
		reauthMessage = '';
		reauthPassword = '';
		reauthCode = '';
		reauthOpen = true;
	}

	async function finishReauthentication() {
		const continuation = pendingContinuation;
		pendingContinuation = null;
		recentlyReauthenticated = true;
		reauthOpen = false;
		reauthPassword = '';
		reauthCode = '';
		await invalidateAll();
		toast.success('Identity confirmed');
		if (continuation) {
			window.setTimeout(continuation);
		}
	}

	async function reauthenticateWithPasskey() {
		reauthMessage = '';
		reauthPending = true;
		try {
			const assertion = await createWebAuthnAssertion('settings-reauth');
			const response = await fetch('/settings/reauth/passkey', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(assertion)
			});
			if (!response.ok) {
				throw new Error((await response.text()) || 'Unable to verify your passkey');
			}
			await finishReauthentication();
		} catch (cause) {
			if (cause instanceof DOMException && cause.name === 'NotAllowedError') {
				reauthMessage = 'Passkey verification was cancelled.';
			} else {
				reauthMessage = cause instanceof Error ? cause.message : 'Unable to confirm your identity';
			}
		} finally {
			reauthPending = false;
		}
	}

	function guardNavigation(event: MouseEvent, destination: SettingsDestination) {
		if (recentlyReauthenticated) return;
		event.preventDefault();
		requestReauthentication(() => void goto(resolve(destination)));
	}

	async function copyRecoveryCode() {
		await navigator.clipboard.writeText(recoveryCode);
		copied = true;
		toast.success('Recovery code copied');
		window.setTimeout(() => (copied = false), 2000);
	}

	function setGeneratedRecoveryCode(value: unknown) {
		if (
			typeof value === 'object' &&
			value !== null &&
			'recoveryCode' in value &&
			typeof value.recoveryCode === 'string'
		) {
			recoveryCode = value.recoveryCode;
		}
	}

	function submitForm(id: string) {
		const form = document.getElementById(id);
		if (form instanceof HTMLFormElement) {
			form.requestSubmit();
		}
	}

	function isReauthenticated(value: unknown): boolean {
		return (
			typeof value === 'object' &&
			value !== null &&
			'reauthenticated' in value &&
			value.reauthenticated === true
		);
	}

	function needsReauthentication(value: unknown): boolean {
		return (
			typeof value === 'object' &&
			value !== null &&
			'reauthenticationRequired' in value &&
			value.reauthenticationRequired === true
		);
	}

	function getActionMessage(value: unknown, fallback: string): string {
		if (typeof value !== 'object' || value === null) return fallback;
		if ('message' in value && typeof value.message === 'string') return value.message;
		for (const nested of Object.values(value)) {
			if (typeof nested === 'object' && nested !== null && 'message' in nested) {
				const message = nested.message;
				if (typeof message === 'string') return message;
			}
		}
		return fallback;
	}
</script>

<svelte:head>
	<title>Settings · flightlesskiwi</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-4xl flex-col gap-8">
	<div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<p class="text-sm font-medium text-primary">Your account</p>
			<h1 class="text-3xl font-bold tracking-tight">Settings</h1>
			<p class="mt-1 text-muted-foreground">
				Manage your account details and how you secure your sign-in.
			</p>
		</div>
		<Tooltip.Provider>
			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<button
							type="button"
							class="cursor-help rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
							{...props}
						>
							<Badge variant={recentlyReauthenticated ? 'secondary' : 'outline'}>
								<ShieldCheckIcon />
								{recentlyReauthenticated
									? 'Identity recently confirmed'
									: 'Re-authentication required'}
							</Badge>
						</button>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content side="bottom" sideOffset={6}>
					{recentlyReauthenticated
						? 'You can make sensitive account changes for five minutes after confirming your identity.'
						: 'Confirm your identity before making sensitive account changes.'}
				</Tooltip.Content>
			</Tooltip.Root>
		</Tooltip.Provider>
	</div>

	<section aria-labelledby="account-heading" class="space-y-4">
		<div>
			<h2 id="account-heading" class="text-xl font-semibold">Account</h2>
			<p class="text-sm text-muted-foreground">Your identity and sign-in credentials.</p>
		</div>

		<div class="grid gap-4 md:grid-cols-2">
			<Card.Root>
				<Card.Header>
					<div class="flex items-center gap-3">
						<div class="flex size-10 items-center justify-center rounded-lg bg-muted">
							<UserRoundIcon class="size-5" />
						</div>
						<div>
							<Card.Title>Profile</Card.Title>
							<Card.Description>Your public account identity.</Card.Description>
						</div>
					</div>
				</Card.Header>
				<Card.Content class="space-y-4">
					<Field.Field>
						<Field.Label for="settings-username">Username</Field.Label>
						<Input id="settings-username" value={data.user.username} disabled />
						<Field.Description>Username changes are not currently available.</Field.Description>
					</Field.Field>
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<div class="flex items-center gap-3">
						<div class="flex size-10 items-center justify-center rounded-lg bg-muted">
							<MailIcon class="size-5" />
						</div>
						<div>
							<Card.Title>Email address</Card.Title>
							<Card.Description>Changing it requires email verification.</Card.Description>
						</div>
					</div>
				</Card.Header>
				<Card.Content>
					<form
						method="POST"
						action="/settings?/update_email"
						use:enhance={settingsSubmit('Verification email sent')}
					>
						<Field.Group>
							<Field.Field>
								<Field.Label for="settings-email">Email</Field.Label>
								<Input
									id="settings-email"
									name="email"
									type="email"
									value={data.user.email}
									autocomplete="email"
									required
								/>
							</Field.Field>
							<Button type="submit" class="w-full sm:w-auto">Update email</Button>
						</Field.Group>
					</form>
				</Card.Content>
			</Card.Root>
		</div>

		<Card.Root>
			<Card.Header>
				<div class="flex items-center gap-3">
					<div class="flex size-10 items-center justify-center rounded-lg bg-muted">
						<LockKeyholeIcon class="size-5" />
					</div>
					<div>
						<Card.Title>Password</Card.Title>
						<Card.Description>
							Use at least 12 characters. Updating it signs out your other sessions.
						</Card.Description>
					</div>
				</div>
			</Card.Header>
			<Card.Content>
				<form
					method="POST"
					action="/settings?/update_password"
					use:enhance={settingsSubmit('Password updated')}
				>
					<Field.Group class="grid gap-4 md:grid-cols-2">
						<Field.Field>
							<Field.Label for="new-password">New password</Field.Label>
							<Input
								id="new-password"
								name="new_password"
								type="password"
								autocomplete="new-password"
								minlength={12}
								maxlength={255}
								required
							/>
						</Field.Field>
						<Field.Field>
							<Field.Label for="confirm-password">Confirm new password</Field.Label>
							<Input
								id="confirm-password"
								name="confirm_password"
								type="password"
								autocomplete="new-password"
								minlength={12}
								maxlength={255}
								required
							/>
						</Field.Field>
						<div class="md:col-span-2">
							<Button type="submit">Update password</Button>
						</div>
					</Field.Group>
				</form>
			</Card.Content>
		</Card.Root>
	</section>

	<Separator />

	<section aria-labelledby="security-heading" class="space-y-4">
		<div>
			<h2 id="security-heading" class="text-xl font-semibold">Two-factor authentication</h2>
			<p class="text-sm text-muted-foreground">
				Use an authenticator or passkey to protect your account.
			</p>
		</div>

		<Card.Root>
			<Card.Content class="p-0">
				<div class="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
					<div class="flex min-w-0 items-start gap-3">
						<div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
							<SmartphoneIcon class="size-5" />
						</div>
						<div>
							<div class="flex flex-wrap items-center gap-2">
								<h3 class="font-semibold">Authenticator app</h3>
								<Badge variant={data.user.registeredTOTP ? 'secondary' : 'outline'}>
									{data.user.registeredTOTP ? 'Enabled' : 'Not configured'}
								</Badge>
							</div>
							<p class="mt-1 text-sm text-muted-foreground">
								Use a rotating six-digit code when signing in.
							</p>
						</div>
					</div>
					{#if data.user.registeredTOTP}
						<form
							id="disconnect-totp-form"
							class="hidden"
							method="POST"
							action="/settings?/disconnect_totp"
							use:enhance={settingsSubmit('Authenticator removed', () => {
								removeAuthenticatorOpen = false;
							})}
						></form>
						<AlertDialog.Root bind:open={removeAuthenticatorOpen}>
							<AlertDialog.Trigger class="inline-flex">
								{#snippet child({ props })}
									<Button variant="destructive" {...props}>
										<Trash2Icon />
										Remove
									</Button>
								{/snippet}
							</AlertDialog.Trigger>
							<AlertDialog.Content>
								<AlertDialog.Header>
									<AlertDialog.Title>Remove authenticator?</AlertDialog.Title>
									<AlertDialog.Description>
										Authenticator codes will stop working immediately. Make sure you still have a
										passkey or another way to access the account.
									</AlertDialog.Description>
								</AlertDialog.Header>
								<AlertDialog.Footer>
									<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
									<Button variant="destructive" onclick={() => submitForm('disconnect-totp-form')}>
										Remove authenticator
									</Button>
								</AlertDialog.Footer>
							</AlertDialog.Content>
						</AlertDialog.Root>
					{:else}
						<Button
							href="/2fa/totp/setup"
							onclick={(event) => guardNavigation(event, '/2fa/totp/setup')}
						>
							<PlusIcon />
							Set up
						</Button>
					{/if}
				</div>

				<Separator />

				<div class="space-y-4 p-5">
					<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
						<div class="flex min-w-0 items-start gap-3">
							<div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
								<FingerprintIcon class="size-5" />
							</div>
							<div>
								<div class="flex flex-wrap items-center gap-2">
									<h3 class="font-semibold">Passkeys</h3>
									<Badge variant={data.passkeyCredentials.length > 0 ? 'secondary' : 'outline'}>
										{data.passkeyCredentials.length}
										{data.passkeyCredentials.length === 1 ? 'passkey' : 'passkeys'}
									</Badge>
								</div>
								<p class="mt-1 text-sm text-muted-foreground">
									Sign in securely with your device, password manager, or security key.
								</p>
							</div>
						</div>
						<Button
							href="/2fa/passkey/register"
							variant="outline"
							onclick={(event) => guardNavigation(event, '/2fa/passkey/register')}
						>
							<PlusIcon />
							Add passkey
						</Button>
					</div>

					{#if data.passkeyCredentials.length > 0}
						<div class="rounded-lg border">
							{#each data.passkeyCredentials as credential, index (credential.id)}
								<div class="flex items-center justify-between gap-3 p-3">
									<div class="flex min-w-0 items-center gap-3">
										<FingerprintIcon class="size-4 shrink-0 text-muted-foreground" />
										<span class="truncate text-sm font-medium">{credential.name}</span>
									</div>
									<form
										id="delete-passkey-{index}"
										class="hidden"
										method="POST"
										action="/settings?/delete_passkey"
										use:enhance={settingsSubmit('Passkey removed', () => {
											removePasskeyId = null;
										})}
									>
										<input type="hidden" name="credential_id" value={credential.id} />
									</form>
									<AlertDialog.Root
										open={removePasskeyId === credential.id}
										onOpenChange={(open) => {
											removePasskeyId = open ? credential.id : null;
										}}
									>
										<AlertDialog.Trigger>
											{#snippet child({ props })}
												<Button
													variant="ghost"
													size="icon-sm"
													aria-label="Remove {credential.name}"
													{...props}
												>
													<Trash2Icon />
												</Button>
											{/snippet}
										</AlertDialog.Trigger>
										<AlertDialog.Content>
											<AlertDialog.Header>
												<AlertDialog.Title>Remove this passkey?</AlertDialog.Title>
												<AlertDialog.Description>
													“{credential.name}” will no longer be able to sign in to this account.
												</AlertDialog.Description>
											</AlertDialog.Header>
											<AlertDialog.Footer>
												<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
												<Button
													variant="destructive"
													onclick={() => submitForm(`delete-passkey-${index}`)}
												>
													Remove passkey
												</Button>
											</AlertDialog.Footer>
										</AlertDialog.Content>
									</AlertDialog.Root>
								</div>
								{#if index < data.passkeyCredentials.length - 1}<Separator />{/if}
							{/each}
						</div>
					{/if}
				</div>
			</Card.Content>
		</Card.Root>
	</section>

	<section aria-labelledby="recovery-heading" class="space-y-4">
		<Card.Root>
			<Card.Header>
				<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
					<div class="flex items-start gap-3">
						<div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
							<KeyRoundIcon class="size-5" />
						</div>
						<div>
							<div class="flex flex-wrap items-center gap-2">
								<Card.Title id="recovery-heading">Recovery code</Card.Title>
								<Badge variant={data.recoveryCodeConfigured ? 'secondary' : 'destructive'}>
									{data.recoveryCodeConfigured ? 'Configured' : 'Missing'}
								</Badge>
							</div>
							<Card.Description class="mt-1">
								Your one-time fallback if you lose access to your authentication methods.
							</Card.Description>
						</div>
					</div>
					{#if data.user.registeredTOTP}
						<form
							id="regenerate-recovery-code-form"
							class="hidden"
							method="POST"
							action="/settings?/regenerate_recovery_code"
							use:enhance={settingsSubmit('Recovery code generated', (value) => {
								setGeneratedRecoveryCode(value);
								replaceRecoveryCodeOpen = false;
							})}
						></form>
						<AlertDialog.Root bind:open={replaceRecoveryCodeOpen}>
							<AlertDialog.Trigger>
								{#snippet child({ props })}
									<Button variant="outline" {...props}>
										<RefreshCwIcon />
										{data.recoveryCodeConfigured ? 'Replace code' : 'Generate code'}
									</Button>
								{/snippet}
							</AlertDialog.Trigger>
							<AlertDialog.Content>
								<AlertDialog.Header>
									<AlertDialog.Title>
										{data.recoveryCodeConfigured
											? 'Replace your recovery code?'
											: 'Generate a recovery code?'}
									</AlertDialog.Title>
									<AlertDialog.Description>
										{data.recoveryCodeConfigured
											? 'Your existing recovery code will stop working immediately.'
											: 'The new code will only be displayed once, so store it somewhere safe.'}
									</AlertDialog.Description>
								</AlertDialog.Header>
								<AlertDialog.Footer>
									<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
									<Button onclick={() => submitForm('regenerate-recovery-code-form')}>
										{data.recoveryCodeConfigured ? 'Replace code' : 'Generate code'}
									</Button>
								</AlertDialog.Footer>
							</AlertDialog.Content>
						</AlertDialog.Root>
					{/if}
				</div>
			</Card.Header>
			{#if recoveryCode}
				<Card.Content>
					<Alert.Root>
						<AlertTriangleIcon />
						<Alert.Title>Save this code now</Alert.Title>
						<Alert.Description>
							<div class="mt-3 flex items-center gap-2 rounded-lg border bg-muted/50 p-3">
								<code class="min-w-0 flex-1 text-center font-mono font-semibold break-all">
									{recoveryCode}
								</code>
								<Button
									variant="ghost"
									size="icon"
									aria-label="Copy recovery code"
									onclick={copyRecoveryCode}
								>
									{#if copied}<CheckIcon />{:else}<ClipboardIcon />{/if}
								</Button>
							</div>
						</Alert.Description>
					</Alert.Root>
				</Card.Content>
			{/if}
		</Card.Root>
	</section>
</div>

<Dialog.Root
	bind:open={reauthOpen}
	onOpenChange={(open) => {
		if (!open) pendingContinuation = null;
	}}
>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Confirm it’s you</Dialog.Title>
			<Dialog.Description>
				This is a sensitive change. Re-authenticate to continue.
			</Dialog.Description>
		</Dialog.Header>

		{#if reauthMessage}
			<Alert.Root variant="destructive">
				<AlertTriangleIcon />
				<Alert.Title>Couldn’t confirm your identity</Alert.Title>
				<Alert.Description>{reauthMessage}</Alert.Description>
			</Alert.Root>
		{/if}

		{#if !data.user.registeredTOTP && !data.user.registeredPasskey}
			<form method="POST" action="/settings?/reauth_password" use:enhance={reauthSubmit}>
				<Field.Group>
					<Field.Field>
						<Field.Label for="reauth-password">Current password</Field.Label>
						<Input
							id="reauth-password"
							name="password"
							type="password"
							bind:value={reauthPassword}
							autocomplete="current-password"
							disabled={reauthPending}
							required
						/>
					</Field.Field>
					<Button type="submit" class="w-full" disabled={reauthPending || !reauthPassword}>
						{#if reauthPending}<LoaderCircleIcon class="animate-spin" />{/if}
						Confirm with password
					</Button>
				</Field.Group>
			</form>
		{:else if data.user.registeredTOTP}
			<form method="POST" action="/settings?/reauth_totp" use:enhance={reauthSubmit}>
				<Field.Group>
					<Field.Field class="items-center">
						<Field.Label for="reauth-code" class="sr-only">Authenticator code</Field.Label>
						<InputOTP.Root
							id="reauth-code"
							maxlength={6}
							class="justify-center"
							bind:value={reauthCode}
							disabled={reauthPending}
							required
						>
							{#snippet children({ cells })}
								<InputOTP.Group
									class="gap-1 *:data-[slot=input-otp-slot]:size-9 *:data-[slot=input-otp-slot]:rounded-md *:data-[slot=input-otp-slot]:border"
								>
									{#each cells as cell (cell)}
										<InputOTP.Slot {cell} />
									{/each}
								</InputOTP.Group>
							{/snippet}
						</InputOTP.Root>
						<input type="hidden" name="code" value={reauthCode} />
					</Field.Field>
					<Button type="submit" class="w-full" disabled={reauthPending || reauthCode.length !== 6}>
						{#if reauthPending}<LoaderCircleIcon class="animate-spin" />{/if}
						Confirm authenticator code
					</Button>
				</Field.Group>
			</form>
		{/if}

		{#if data.user.registeredPasskey}
			{#if data.user.registeredTOTP}
				<div class="flex items-center gap-3">
					<Separator class="flex-1" />
					<span class="text-xs text-muted-foreground">or</span>
					<Separator class="flex-1" />
				</div>
			{/if}
			<Button
				variant="outline"
				class="w-full"
				disabled={reauthPending}
				onclick={reauthenticateWithPasskey}
			>
				{#if reauthPending}
					<LoaderCircleIcon class="animate-spin" />
				{:else}
					<FingerprintIcon />
				{/if}
				Confirm with passkey
			</Button>
		{/if}
	</Dialog.Content>
</Dialog.Root>
