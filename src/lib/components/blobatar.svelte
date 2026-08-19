<script lang="ts">
	import 'blobatar/motion.css';
	// Blobatar only exposes animated rendering through its React adapter. Keep this private
	// renderer dependency isolated here until it provides a framework-neutral entry point.
	import { _parts } from '../../../node_modules/blobatar/src/blobatar.ts';
	import type { Animate, BlobatarOptions, Expression } from 'blobatar';
	import * as expressions from 'blobatar/expression';
	import { blobatarUri } from 'blobatar/uri';
	import { onDestroy } from 'svelte';
	import type { HTMLImgAttributes, SVGAttributes } from 'svelte/elements';

	const reactions = Object.values(expressions).filter(
		(value): value is Expression => typeof value !== 'function' && value !== expressions.idle
	);
	const reactionHoldMs = 1500;

	type SharedProps = Omit<BlobatarOptions, 'animate'> & {
		/** The user, bot, team, or other subject this avatar represents. */
		name: string;
	};
	type StaticProps = SharedProps &
		Omit<HTMLImgAttributes, 'src'> & {
			animate?: false;
			reactOnClick?: false;
			ref?: HTMLImageElement | null;
		};
	type AnimatedProps = SharedProps &
		Omit<SVGAttributes<SVGSVGElement>, 'children' | 'viewBox'> & {
			/** Opts into inline SVG so Blobatar's motion styles can reach its parts. */
			animate: Animate;
			/** Momentarily shows a random expression when the blobatar is clicked. */
			reactOnClick?: boolean;
			alt?: never;
			ref?: SVGSVGElement | null;
		};
	type Props = StaticProps | AnimatedProps;

	let {
		ref = $bindable(null),
		name,
		size,
		background,
		palette,
		hue,
		tone,
		traits,
		normalize,
		contrast,
		title,
		animate,
		reactOnClick = false,
		expression,
		alt,
		style,
		...restProps
	}: Props = $props();

	let reactionExpression = $state<Expression>();
	let reactionRelease: ReturnType<typeof setTimeout> | undefined;
	let shownExpression = $derived(reactionExpression ?? expression);
	let options = $derived({
		size,
		background,
		palette,
		hue,
		tone,
		traits,
		normalize,
		contrast,
		title,
		expression: shownExpression
	});
	let parts = $derived(animate ? _parts(name, { ...options, animate }) : null);
	let src = $derived(animate ? '' : blobatarUri(name, options));
	let animatedStyle = $derived(
		parts ? [serializeVars(parts.vars), style].filter(Boolean).join(';') : undefined
	);
	// SAFETY: all Blobatar options were removed above, and `parts` selects the animated prop branch.
	let animatedProps = $derived(
		restProps as Omit<SVGAttributes<SVGSVGElement>, 'children' | 'viewBox'>
	);
	// SAFETY: all Blobatar options were removed above, and the fallback selects the static prop branch.
	let staticProps = $derived(restProps as Omit<HTMLImgAttributes, 'src'>);

	function serializeVars(vars: Record<string, string> | undefined): string {
		return Object.entries(vars ?? {})
			.map(([property, value]) => `${property}:${value}`)
			.join(';');
	}

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

{#snippet animatedBlobatar()}
	{#if parts}
		<svg
			bind:this={ref}
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 100 100"
			width={size}
			height={size}
			role={title && !reactOnClick ? 'img' : undefined}
			aria-hidden={title && !reactOnClick ? undefined : true}
			style={animatedStyle}
			{...animatedProps}
		>
			{#if title}<title>{title}</title>{/if}
			{#if parts.bg}<path d={parts.bg.d} fill={parts.bg.fill} />{/if}
			<g class={parts.cls}>
				<!-- Blobatar owns this deterministic SVG markup; no raw user input is interpolated. -->
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html parts.inner}
			</g>
		</svg>
	{/if}
{/snippet}

{#if parts && reactOnClick}
	<button
		type="button"
		onclick={react}
		aria-label="Make blobatar react"
		class="inline-flex cursor-pointer appearance-none rounded-full border-0 bg-transparent p-0 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
	>
		{@render animatedBlobatar()}
	</button>
{:else if parts}
	{@render animatedBlobatar()}
{:else}
	<img
		bind:this={ref}
		{src}
		width={size}
		height={size}
		alt={alt ?? title ?? ''}
		{style}
		{...staticProps}
	/>
{/if}
