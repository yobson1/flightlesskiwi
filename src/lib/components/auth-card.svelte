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
</script>

{#snippet challenge()}
	{#if turnstile.siteKey}
		<Turnstile
			siteKey={turnstile.siteKey}
			onToken={turnstile.onToken}
			onError={turnstile.onError}
			onResetReady={turnstile.onResetReady}
		/>
	{/if}
{/snippet}

{#if side}
	<Card.Root class={cn('overflow-hidden p-0', className)} {...restProps}>
		<Card.Content class="grid p-0 md:grid-cols-2">
			<form class="flex flex-col gap-6 p-6 md:p-8" onsubmit={formSubmit}>
				{@render children?.()}
				{@render challenge()}
			</form>
			{@render side()}
		</Card.Content>
	</Card.Root>
{:else}
	<Card.Root class={className} {...restProps}>
		{@render children?.()}
		{#if turnstile.siteKey}
			<Card.Content class="flex justify-center">
				{@render challenge()}
			</Card.Content>
		{/if}
	</Card.Root>
{/if}
