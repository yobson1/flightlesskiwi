<script lang="ts">
	import ChartNoAxesCombinedIcon from '@lucide/svelte/icons/chart-no-axes-combined';
	import ShaderRenderer from '$lib/components/shader-renderer.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import Wordmark from '$lib/components/wordmark.svelte';
	import fragShaderSource from '$lib/shaders/isovalues/frag.glsl?raw';
	import vertShaderSource from '$lib/shaders/isovalues/vert.glsl?raw';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	interface Props extends WithElementRef<HTMLAttributes<HTMLDivElement>> {
		flip?: boolean;
	}

	let { ref = $bindable(null), class: className, flip = false, ...restProps }: Props = $props();

	// Decorative mock runs for the readout card — not real data.
	const runs = $derived(
		flip
			? [
					{ label: 'RTX 4080 · High', fps: 142, low: 118, frametime: 7.0 },
					{ label: 'RX 7900 XT · High', fps: 131, low: 104, frametime: 7.6 }
				]
			: [
					{ label: 'Steam Deck OLED', fps: 58, low: 49, frametime: 17.2 },
					{ label: 'Steam Deck LCD', fps: 44, low: 36, frametime: 22.7 }
				]
	);
</script>

<div
	bind:this={ref}
	class={cn(
		'relative hidden min-h-full flex-col justify-between overflow-hidden border-l bg-muted/40 md:flex',
		className
	)}
	aria-hidden="true"
	{...restProps}
>
	<div class="absolute inset-0 opacity-[0.11] dark:opacity-[0.07]">
		<ShaderRenderer
			{vertShaderSource}
			{fragShaderSource}
			class="absolute inset-0 size-full invert dark:invert-0"
		/>
	</div>

	<div class="relative p-8">
		<Wordmark size="large" />
	</div>

	<Card.Root class="relative mx-8">
		<Card.Header>
			<Card.Title class="flex items-center gap-2 text-sm text-muted-foreground">
				<ChartNoAxesCombinedIcon class="size-4" />
				Run comparison
			</Card.Title>
			<Card.Action>
				<span class="flex items-center gap-1.5 text-xs text-muted-foreground">
					<span class="size-1.5 rounded-full bg-emerald-500"></span>
					2 runs
				</span>
			</Card.Action>
		</Card.Header>
		<Card.Content class="space-y-3">
			{#each runs as run, index (run.label)}
				<div>
					<div class="mb-1 flex items-baseline justify-between gap-2">
						<span class="truncate text-xs text-muted-foreground">{run.label}</span>
						<span class="shrink-0 font-mono text-sm font-semibold tabular-nums">
							{run.fps} <span class="text-xs font-normal text-muted-foreground">FPS</span>
						</span>
					</div>
					<div class="h-1.5 overflow-hidden rounded-full bg-muted">
						<div
							class="h-full rounded-full"
							style="width: {(run.fps / runs[0]!.fps) * 100}%; background: var(--chart-{index +
								1});"
						></div>
					</div>
					<div
						class="mt-1 flex justify-between font-mono text-[0.65rem] text-muted-foreground tabular-nums"
					>
						<span>1% low {run.low}</span>
						<span>{run.frametime}ms</span>
					</div>
				</div>
			{/each}
		</Card.Content>
	</Card.Root>

	<p class="relative max-w-xs p-8 leading-relaxed text-balance text-muted-foreground">
		Upload MangoHud or PresentMon output and see exactly how each run compares.
	</p>
</div>
