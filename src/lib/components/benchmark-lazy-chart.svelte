<script lang="ts" module>
	import { tick } from 'svelte';

	interface RenderJob {
		cancelled: boolean;
		render: () => void;
	}

	const renderQueue: RenderJob[] = [];
	let rendering = false;

	function enqueueChartRender(render: () => void) {
		const job: RenderJob = { cancelled: false, render };
		renderQueue.push(job);
		void drainRenderQueue();

		return () => {
			job.cancelled = true;
		};
	}

	async function drainRenderQueue() {
		if (rendering) return;
		rendering = true;

		while (renderQueue.length > 0) {
			const job = renderQueue.shift()!;
			if (job.cancelled) continue;

			await waitForIdleTime();
			if (job.cancelled) continue;

			job.render();
			await tick();
			await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
		}

		rendering = false;
	}

	function waitForIdleTime() {
		return new Promise<void>((resolve) => {
			if ('requestIdleCallback' in window) {
				window.requestIdleCallback(() => resolve(), { timeout: 250 });
			} else {
				setTimeout(resolve);
			}
		});
	}
</script>

<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { cn } from '$lib/utils';

	interface Props {
		children: Snippet;
		class?: string;
	}

	let { children, class: className }: Props = $props();
	let container: HTMLDivElement;
	let renderChart = $state(false);

	onMount(() => {
		let cancelQueuedRender: (() => void) | undefined;
		let observer: IntersectionObserver | undefined;

		const queueRender = () => {
			observer?.disconnect();
			cancelQueuedRender = enqueueChartRender(() => {
				renderChart = true;
			});
		};

		if ('IntersectionObserver' in window) {
			observer = new IntersectionObserver(
				(entries) => {
					if (entries.some(({ isIntersecting }) => isIntersecting)) queueRender();
				},
				{ rootMargin: '200px 0px' }
			);
			observer.observe(container);
		} else {
			queueRender();
		}

		return () => {
			observer?.disconnect();
			cancelQueuedRender?.();
		};
	});
</script>

<div
	bind:this={container}
	class={cn('min-h-80', className)}
	aria-busy={!renderChart}
	aria-label={renderChart ? undefined : 'Loading chart'}
>
	{#if renderChart}
		{@render children()}
	{:else}
		<div class="h-full rounded-xl border bg-card p-4" style="min-height: inherit">
			<Skeleton class="h-5 w-32" />
			<Skeleton class="mt-2 h-4 w-64 max-w-full" />
			<Skeleton class="mt-4 h-64" />
		</div>
	{/if}
</div>
