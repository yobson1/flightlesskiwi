<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import ClipboardIcon from '@lucide/svelte/icons/clipboard';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import QRCode from 'qrcode';
	import { TOTP_CODE_LENGTH, TOTP_CODE_LENGTH_WORD } from '#lib/auth-constants.js';
	import { authRequest, AuthAPIError } from '#lib/client/auth-api.js';
	import { formDataFromSubmitEvent } from '#lib/client/forms.js';
	import AuthCard from '#lib/components/auth-card.svelte';
	import { Button, buttonVariants } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import * as InputOTP from '#lib/components/ui/input-otp/index.js';
	import { cn } from '#lib/utils.js';
	import type { AuthModalView } from '#lib/types/auth.js';

	interface Props {
		keyURI: string;
		onComplete?: (next: AuthModalView | null) => void | Promise<void>;
	}

	let { keyURI, onComplete }: Props = $props();
	const secret = $derived(getSecret(keyURI));
	let code = $state('');
	let message = $state('');
	let pending = $state(false);
	let copied = $state(false);
	let qrCode = $state('');

	$effect(() => {
		const uri = keyURI;
		void QRCode.toDataURL(uri, {
			width: 192,
			margin: 1,
			errorCorrectionLevel: 'M',
			color: { dark: '#000000', light: '#ffffff' }
		}).then((value) => {
			if (keyURI === uri) qrCode = value;
		});
	});

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		message = '';
		pending = true;
		try {
			const result = await authRequest('/api/auth/totp-setup', {
				method: 'PUT',
				body: formDataFromSubmitEvent(event)
			});
			await onComplete?.(result.next);
		} catch (cause) {
			if (cause instanceof AuthAPIError && cause.modal) await onComplete?.(cause.modal);
			message = cause instanceof Error ? cause.message : 'Invalid code';
		} finally {
			pending = false;
		}
	}

	async function copySecret() {
		await navigator.clipboard.writeText(secret);
		copied = true;
		window.setTimeout(() => (copied = false), 2000);
	}

	function getSecret(uri: string): string {
		try {
			return new URL(uri).searchParams.get('secret') ?? '';
		} catch {
			return '';
		}
	}
</script>

<AuthCard>
	<Card.Header>
		<div class="grid grid-cols-[2.25rem_1fr_2.25rem] items-center gap-2">
			<div class="flex size-9 items-center justify-center rounded-full bg-muted">
				<KeyRoundIcon class="size-4" />
			</div>
			<Card.Title class="text-center">Set up your authenticator</Card.Title>
			<span aria-hidden="true"></span>
		</div>
		<Card.Description class="text-center text-balance">
			Add this account in your authenticator app, then enter its {TOTP_CODE_LENGTH_WORD}-digit code.
		</Card.Description>
	</Card.Header>
	<Card.Content class="space-y-4">
		<div class="flex justify-center">
			{#if qrCode}
				<img
					src={qrCode}
					alt="QR code containing your authenticator setup key"
					class="size-44 rounded-lg bg-white p-2"
				/>
			{:else}
				<div class="flex size-44 items-center justify-center rounded-lg bg-white">
					<LoaderCircleIcon class="animate-spin text-black" />
				</div>
			{/if}
		</div>
		<a href={keyURI} class={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'w-full')}>
			Open authenticator app
		</a>
		<div class="rounded-lg border bg-muted/40 p-3">
			<p class="mb-2 text-xs font-medium text-muted-foreground">Manual setup key</p>
			<div class="flex items-center gap-2">
				<code class="min-w-0 flex-1 text-sm break-all">{secret}</code>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					aria-label="Copy setup key"
					onclick={copySecret}
				>
					{#if copied}<CheckIcon />{:else}<ClipboardIcon />{/if}
				</Button>
			</div>
		</div>
		<form onsubmit={submit}>
			<Field.Group>
				<Field.Field class="items-center">
					<Field.Label for="totp-setup-code" class="sr-only">Authenticator code</Field.Label>
					<InputOTP.Root
						maxlength={TOTP_CODE_LENGTH}
						id="totp-setup-code"
						class="justify-center"
						bind:value={code}
						disabled={pending}
						aria-invalid={message ? 'true' : undefined}
						required
					>
						{#snippet children({ cells })}
							<InputOTP.Group
								class="gap-1.5 *:data-[slot=input-otp-slot]:size-9 *:data-[slot=input-otp-slot]:rounded-md *:data-[slot=input-otp-slot]:border"
							>
								{#each cells as cell (cell)}
									<InputOTP.Slot {cell} />
								{/each}
							</InputOTP.Group>
						{/snippet}
					</InputOTP.Root>
					<input type="hidden" name="code" value={code} />
					{#if message}<Field.Error>{message}</Field.Error>{/if}
				</Field.Field>
				<Button
					type="submit"
					size="lg"
					class="w-full"
					disabled={pending || code.length !== TOTP_CODE_LENGTH}
				>
					{#if pending}
						<LoaderCircleIcon class="animate-spin" />
						Verifying…
					{:else}
						Finish setup
					{/if}
				</Button>
			</Field.Group>
		</form>
	</Card.Content>
</AuthCard>
