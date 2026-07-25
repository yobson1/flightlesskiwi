<script lang="ts">
	import AlertTriangleIcon from '@lucide/svelte/icons/triangle-alert';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ClipboardIcon from '@lucide/svelte/icons/clipboard';
	import FingerprintIcon from '@lucide/svelte/icons/fingerprint';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';
	import LockKeyholeIcon from '@lucide/svelte/icons/lock-keyhole';
	import MailIcon from '@lucide/svelte/icons/mail';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
	import SmartphoneIcon from '@lucide/svelte/icons/smartphone';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import UserRoundIcon from '@lucide/svelte/icons/user-round';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { getAuthModal } from '$lib/auth-modal';
	import {
		MAX_EMAIL_LENGTH,
		MAX_PASSWORD_LENGTH,
		MAX_USERNAME_LENGTH,
		MIN_PASSWORD_LENGTH,
		MIN_USERNAME_LENGTH,
		TOTP_CODE_LENGTH_WORD
	} from '$lib/auth-constants';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import { toast } from 'svelte-sonner';
	import { getActionMessage } from '$lib/utils';
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const authModal = getAuthModal();

	let recentlyReauthenticated = $derived(data.recentlyReauthenticated);
	let recoveryCode = $state('');
	let copied = $state(false);
	let removeAuthenticatorOpen = $state(false);
	let removePasskeyId = $state<string | null>(null);
	let replaceRecoveryCodeOpen = $state(false);
	let deleteAccountOpen = $state(false);
	let deleteAccountConfirmation = $state('');

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
					toast.success(getActionMessage(result.data, successMessage));
				}
				await update({
					reset: result.type === 'success',
					invalidateAll: result.type === 'success'
				});
			};
		};
	}

	function requestReauthentication(continuation: () => void) {
		void authModal.open('reauth', {
			onComplete: async () => {
				recentlyReauthenticated = true;
				await invalidateAll();
				toast.success('Identity confirmed');
				window.setTimeout(continuation);
			}
		});
	}

	function requestAuthenticatorSetup() {
		void authModal.open('totp-setup');
	}

	function requestPasskeySetup() {
		void authModal.open('passkey-register');
	}

	function requestAccountDeletion() {
		const openConfirmation = () => {
			deleteAccountConfirmation = '';
			deleteAccountOpen = true;
		};
		if (recentlyReauthenticated) {
			openConfirmation();
			return;
		}
		requestReauthentication(openConfirmation);
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

	function needsReauthentication(value: unknown): boolean {
		return (
			typeof value === 'object' &&
			value !== null &&
			'reauthenticationRequired' in value &&
			value.reauthenticationRequired === true
		);
	}
</script>

<svelte:head>
	<title>Settings · flightlesskiwi</title>
</svelte:head>

<div class="flex flex-col gap-8">
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
				<Card.Content>
					<form
						method="POST"
						action="/settings?/update_username"
						use:enhance={settingsSubmit('Username updated')}
					>
						<Field.Group>
							<Field.Field>
								<Field.Label for="settings-username">Username</Field.Label>
								<Input
									id="settings-username"
									name="username"
									value={data.user.username}
									autocomplete="username"
									minlength={MIN_USERNAME_LENGTH}
									maxlength={MAX_USERNAME_LENGTH}
									required
								/>
								<Field.Description>
									{MIN_USERNAME_LENGTH}–{MAX_USERNAME_LENGTH} letters, numbers, spaces, underscores, or
									hyphens. Usernames are unique.
								</Field.Description>
							</Field.Field>
							<Button type="submit" class="w-full sm:w-auto">Update username</Button>
						</Field.Group>
					</form>
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
									maxlength={MAX_EMAIL_LENGTH}
									required
								/>
								<Field.Description>
									We’ll send a verification code to the new address before updating your account.
								</Field.Description>
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
							Use at least {MIN_PASSWORD_LENGTH} characters. Updating it signs out your other sessions.
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
								minlength={MIN_PASSWORD_LENGTH}
								maxlength={MAX_PASSWORD_LENGTH}
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
								minlength={MIN_PASSWORD_LENGTH}
								maxlength={MAX_PASSWORD_LENGTH}
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
								Use a rotating {TOTP_CODE_LENGTH_WORD}-digit code when signing in.
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
						<Button onclick={requestAuthenticatorSetup}>
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
						<Button variant="outline" onclick={requestPasskeySetup}>
							<PlusIcon />
							Add passkey
						</Button>
					</div>

					{#if data.passkeyCredentials.length > 0}
						<div class="rounded-lg border">
							{#each data.passkeyCredentials as credential, index (credential.id)}
								<div class="flex items-center justify-between gap-3 p-3">
									<div class="flex min-w-0 items-center gap-3">
										{#if credential.iconLight || credential.iconDark}
											<img
												src={credential.iconLight ?? credential.iconDark}
												alt=""
												class="size-4 shrink-0 object-contain dark:hidden"
											/>
											<img
												src={credential.iconDark ?? credential.iconLight}
												alt=""
												class="hidden size-4 shrink-0 object-contain dark:block"
											/>
										{:else}
											<FingerprintIcon class="size-4 shrink-0 text-muted-foreground" />
										{/if}
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

	<Separator />

	<section aria-labelledby="danger-zone-heading" class="space-y-4">
		<div>
			<h2 id="danger-zone-heading" class="text-xl font-semibold text-destructive">Danger zone</h2>
			<p class="text-sm text-muted-foreground">Irreversible account actions.</p>
		</div>

		<Card.Root class="bg-destructive/5 ring-destructive/40">
			<Card.Content>
				<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<h3 class="font-semibold text-destructive">Delete this account</h3>
						<p class="mt-1 text-sm text-muted-foreground">
							Permanently delete your account and all data associated with it. This cannot be
							undone.
						</p>
					</div>
					<Button variant="destructive" class="shrink-0" onclick={requestAccountDeletion}>
						<Trash2Icon />
						Delete account
					</Button>
				</div>
			</Card.Content>
		</Card.Root>
	</section>
</div>

<AlertDialog.Root
	bind:open={deleteAccountOpen}
	onOpenChange={(open) => {
		if (!open) deleteAccountConfirmation = '';
	}}
>
	<AlertDialog.Content>
		<form
			method="POST"
			action="/settings?/delete_account"
			use:enhance={settingsSubmit('Account deleted')}
		>
			<div class="grid gap-4">
				<AlertDialog.Header>
					<AlertDialog.Title>Delete your account?</AlertDialog.Title>
					<AlertDialog.Description>
						This permanently deletes your account and every database record associated with it. This
						action cannot be undone.
					</AlertDialog.Description>
				</AlertDialog.Header>
				<Field.Field>
					<Field.Label for="delete-account-username">
						Type <strong class="font-semibold text-foreground">{data.user.username}</strong> to confirm
					</Field.Label>
					<Input
						id="delete-account-username"
						name="username"
						bind:value={deleteAccountConfirmation}
						autocomplete="off"
						spellcheck="false"
						required
					/>
				</Field.Field>
				<AlertDialog.Footer>
					<AlertDialog.Cancel type="button">Cancel</AlertDialog.Cancel>
					<Button
						type="submit"
						variant="destructive"
						disabled={deleteAccountConfirmation !== data.user.username}
					>
						Delete this account
					</Button>
				</AlertDialog.Footer>
			</div>
		</form>
	</AlertDialog.Content>
</AlertDialog.Root>
