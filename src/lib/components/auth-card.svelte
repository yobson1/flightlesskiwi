<script lang="ts">
	import { getAuthTurnstile } from '$lib/auth-turnstile-context';
	import Turnstile from '$lib/components/turnstile.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import { cn } from '$lib/utils.js';
	import type { ComponentProps, Snippet } from 'svelte';

	type Props = ComponentProps<typeof Card.Root> & {
		side?: Snippet;
		formSubmit?: (event: SubmitEvent) => void | Promise<void>;
	};

	let { children, side, formSubmit, class: className, ...restProps }: Props = $props();
	const turnstile = getAuthTurnstile();
	let turnstileInteractive = $state(false);
</script>

{#snippet challenge()}
	{#if turnstile.siteKey}
		<Turnstile
			siteKey={turnstile.siteKey}
			onToken={turnstile.onToken}
			onError={turnstile.onError}
			onInteractiveChange={(interactive) => (turnstileInteractive = interactive)}
			onResetReady={turnstile.onResetReady}
		/>
	{/if}
{/snippet}

{#if side}
	<Card.Root class={cn('overflow-hidden p-0', className)} {...restProps}>
		<Card.Content class="grid p-0 md:grid-cols-2">
			<form class="relative flex flex-col gap-6 p-6 md:p-8" onsubmit={formSubmit}>
				{@render children?.()}
				<div
					class="flex justify-center"
					class:absolute={!turnstileInteractive}
					class:inset-x-0={!turnstileInteractive}
					class:bottom-0={!turnstileInteractive}
					aria-hidden={!turnstileInteractive}
				>
					{@render challenge()}
				</div>
			</form>
			{@render side()}
		</Card.Content>
	</Card.Root>
{:else}
	<Card.Root class={cn('relative', className)} {...restProps}>
		{@render children?.()}
		{#if turnstile.siteKey}
			<div
				class="flex justify-center px-(--card-spacing)"
				class:absolute={!turnstileInteractive}
				class:inset-x-0={!turnstileInteractive}
				class:bottom-0={!turnstileInteractive}
				aria-hidden={!turnstileInteractive}
			>
				{@render challenge()}
			</div>
		{/if}
	</Card.Root>
{/if}
