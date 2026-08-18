<script lang="ts">
	import 'blobatar/motion.css';
	import { _parts } from '../../../node_modules/blobatar/src/blobatar.ts';
	import { blobatarUri } from '../../../node_modules/blobatar/src/uri.ts';
	import type { Animate, BlobatarOptions } from 'blobatar';
	import type { HTMLImgAttributes, SVGAttributes } from 'svelte/elements';

	type SharedProps = Omit<BlobatarOptions, 'animate'> & {
		/** The user, bot, team, or other subject this avatar represents. */
		name: string;
	};
	type StaticProps = SharedProps &
		Omit<HTMLImgAttributes, 'src'> & {
			animate?: false;
			ref?: HTMLImageElement | null;
		};
	type AnimatedProps = SharedProps &
		Omit<SVGAttributes<SVGSVGElement>, 'children' | 'viewBox'> & {
			/** Opts into inline SVG so Blobatar's motion styles can reach its parts. */
			animate: Animate;
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
		expression,
		alt,
		style,
		...restProps
	}: Props = $props();

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
		expression
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
</script>

{#if parts}
	<svg
		bind:this={ref}
		xmlns="http://www.w3.org/2000/svg"
		viewBox="0 0 100 100"
		width={size}
		height={size}
		role={title ? 'img' : undefined}
		aria-hidden={title ? undefined : true}
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
