<script lang="ts">
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import { authFormRequest, AuthAPIError } from '$lib/client/auth-api';
	import favicon from '$lib/assets/favicon.svg';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
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
	<Card.Root class="overflow-hidden p-0">
		<Card.Content class="grid p-0 md:grid-cols-2">
			<form class="p-6 md:p-8" onsubmit={submit}>
				<Field.Group>
					<div class="flex flex-col items-center gap-2 text-center">
						<h2 class="text-2xl font-bold">Create your account</h2>
						<p class="text-balance text-muted-foreground">
							Start building your flightlesskiwi library
						</p>
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
							minlength={3}
							maxlength={31}
							disabled={pending}
							required
						/>
						<Field.Description
							>3–31 letters, numbers, spaces, underscores, or hyphens. Usernames are unique.</Field.Description
						>
					</Field.Field>
					<Field.Field>
						<Field.Label for="signup-email-{id}">Email</Field.Label>
						<Input
							id="signup-email-{id}"
							name="email"
							type="email"
							placeholder="you@example.com"
							autocomplete="email"
							maxlength={255}
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
									minlength={12}
									maxlength={255}
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
									minlength={12}
									maxlength={255}
									disabled={pending}
									required
								/>
							</Field.Field>
						</div>
						<Field.Description>Use at least 12 characters.</Field.Description>
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
						<Button
							variant="outline"
							type="button"
							disabled
							aria-label="Google sign-up coming soon"
						>
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
			</form>

			<div
				class="relative hidden min-h-full overflow-hidden border-l bg-[radial-gradient(circle_at_bottom_left,var(--color-primary),transparent_55%),linear-gradient(145deg,var(--color-muted),var(--color-background))] md:flex md:flex-col md:justify-between"
				aria-hidden="true"
			>
				<div
					class="absolute -bottom-20 -left-20 size-64 rounded-full border border-foreground/10"
				></div>
				<div
					class="absolute top-16 right-12 size-28 rounded-full border border-foreground/10"
				></div>
				<div class="relative flex items-center gap-3 p-8">
					<img src={favicon} alt="" class="size-10" />
					<span class="text-lg font-semibold">flightlesskiwi</span>
				</div>
				<p class="relative max-w-xs p-8 text-lg leading-relaxed font-medium text-balance">
					Keep the games you care about close, searchable, and ready to compare.
				</p>
			</div>
		</Card.Content>
	</Card.Root>
</div>
