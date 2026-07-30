<script lang="ts">
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import {
		MAX_EMAIL_LENGTH,
		MAX_PASSWORD_LENGTH,
		MAX_USERNAME_LENGTH,
		MIN_PASSWORD_LENGTH,
		MIN_USERNAME_LENGTH
	} from '$lib/auth-constants';
	import { authFormRequest, AuthAPIError } from '$lib/client/auth-api';
	import AuthCard from '$lib/components/auth-card.svelte';
	import AuthSidePanel from '$lib/components/auth-side-panel.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { cn } from '$lib/utils.js';
	import type { AuthModalView } from '$lib/types/auth';
	import type { HTMLAttributes } from 'svelte/elements';

	interface Props extends HTMLAttributes<HTMLDivElement> {
		onSwitchToLogin?: () => void;
		onComplete?: (next: AuthModalView | null) => void | Promise<void>;
	}

	let { class: className, onSwitchToLogin, onComplete, ...restProps }: Props = $props();

	const id = $props.id();
	let message = $state('');
	let pending = $state(false);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		const form = event.currentTarget as HTMLFormElement;
		const formData = new FormData(form);
		message = '';
		if (formData.get('password') !== formData.get('confirm-password')) {
			message = 'Passwords do not match';
			return;
		}
		pending = true;
		try {
			const result = await authFormRequest('/api/auth/signup', formData);
			await onComplete?.(result.next);
		} catch (cause) {
			if (cause instanceof AuthAPIError && cause.modal) await onComplete?.(cause.modal);
			message = cause instanceof Error ? cause.message : 'Unable to create your account';
		} finally {
			pending = false;
		}
	}
</script>

<div class={cn('flex flex-col gap-6', className)} {...restProps}>
	<AuthCard formSubmit={submit}>
		<Field.Group>
			<div class="flex flex-col items-center gap-2 text-center">
				<h2 class="text-2xl font-bold">Create your account</h2>
				<p class="text-balance text-muted-foreground">Start building your flightlesskiwi library</p>
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
				<Field.Label for="signup-username-{id}">Username</Field.Label>
				<Input
					id="signup-username-{id}"
					name="username"
					placeholder="kiwi_fan"
					autocomplete="username"
					minlength={MIN_USERNAME_LENGTH}
					maxlength={MAX_USERNAME_LENGTH}
					disabled={pending}
					required
				/>
				<Field.Description>
					{MIN_USERNAME_LENGTH}–{MAX_USERNAME_LENGTH} letters, numbers, spaces, underscores, or hyphens.
					Usernames are unique.
				</Field.Description>
			</Field.Field>
			<Field.Field>
				<Field.Label for="signup-email-{id}">Email</Field.Label>
				<Input
					id="signup-email-{id}"
					name="email"
					type="email"
					placeholder="you@example.com"
					autocomplete="email"
					maxlength={MAX_EMAIL_LENGTH}
					disabled={pending}
					required
				/>
			</Field.Field>
			<Field.Field>
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<Field.Field>
						<Field.Label for="signup-password-{id}">Password</Field.Label>
						<Input
							id="signup-password-{id}"
							name="password"
							type="password"
							autocomplete="new-password"
							minlength={MIN_PASSWORD_LENGTH}
							maxlength={MAX_PASSWORD_LENGTH}
							disabled={pending}
							required
						/>
					</Field.Field>
					<Field.Field>
						<Field.Label for="signup-confirm-password-{id}">Confirm password</Field.Label>
						<Input
							id="signup-confirm-password-{id}"
							name="confirm-password"
							type="password"
							autocomplete="new-password"
							minlength={MIN_PASSWORD_LENGTH}
							maxlength={MAX_PASSWORD_LENGTH}
							disabled={pending}
							required
						/>
					</Field.Field>
				</div>
				<Field.Description>Use at least {MIN_PASSWORD_LENGTH} characters.</Field.Description>
			</Field.Field>
			<Field.Field>
				<Button type="submit" size="lg" class="w-full" disabled={pending}>
					{#if pending}
						<LoaderCircleIcon class="animate-spin" />
						Creating account…
					{:else}
						Create account
					{/if}
				</Button>
			</Field.Field>
			<Field.Separator class="*:data-[slot=field-separator-content]:bg-card">
				OAuth providers coming soon
			</Field.Separator>
			<Field.Field class="grid grid-cols-3 gap-4">
				<Button variant="outline" type="button" disabled aria-label="Apple sign-up coming soon">
					<span aria-hidden="true" class="font-semibold">A</span>
				</Button>
				<Button variant="outline" type="button" disabled aria-label="Google sign-up coming soon">
					<span aria-hidden="true" class="font-semibold">G</span>
				</Button>
				<Button variant="outline" type="button" disabled aria-label="Meta sign-up coming soon">
					<span aria-hidden="true" class="font-semibold">M</span>
				</Button>
			</Field.Field>
			<Field.Description class="text-center">
				Already have an account?
				<button
					type="button"
					class="font-medium text-foreground underline underline-offset-4 hover:text-primary"
					onclick={onSwitchToLogin}
				>
					Sign in
				</button>
			</Field.Description>
		</Field.Group>

		{#snippet side()}
			<AuthSidePanel flip />
		{/snippet}
	</AuthCard>
</div>
