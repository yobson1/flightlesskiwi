<script lang="ts">
	import { Blobatar as BaseBlobatar, type BlobatarProps } from '@blobatar/svelte';
	import 'blobatar/motion.css';
	import type { Animate, Expression } from 'blobatar';
	import * as expressions from 'blobatar/expression';
	import { onDestroy } from 'svelte';

	const reactions = Object.values(expressions).filter(
		(value): value is Expression => typeof value !== 'function' && value !== expressions.idle
	);
	const reactionHoldMs = 1500;

	type Props =
		| (BlobatarProps & {
				animate?: false;
				reactOnClick?: false;
		  })
		| (BlobatarProps & {
				animate: Animate;
				/** Momentarily shows a random expression when an animated blobatar is clicked. */
				reactOnClick?: boolean;
		  });

	let { reactOnClick = false, ...blobatarProps }: Props = $props();

	let reactionExpression = $state<Expression>();
	let reactionRelease: ReturnType<typeof setTimeout> | undefined;
	let shownExpression = $derived(reactionExpression ?? blobatarProps.expression);

	function react() {
		const availableReactions = reactions.filter((reaction) => reaction !== shownExpression);
		reactionExpression = availableReactions[Math.floor(Math.random() * availableReactions.length)];
		clearTimeout(reactionRelease);
		reactionRelease = setTimeout(() => {
			reactionExpression = undefined;
			reactionRelease = undefined;
		}, reactionHoldMs);
	}

	onDestroy(() => clearTimeout(reactionRelease));
</script>

{#if reactOnClick && blobatarProps.animate}
	<button
		type="button"
		onclick={react}
		aria-label="Make blobatar react"
		class="inline-flex cursor-pointer appearance-none rounded-full border-0 bg-transparent p-0 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
	>
		<BaseBlobatar
			{...blobatarProps}
			expression={shownExpression}
			role={undefined}
			aria-hidden={true}
		/>
	</button>
{:else}
	<BaseBlobatar {...blobatarProps} expression={shownExpression} />
{/if}
