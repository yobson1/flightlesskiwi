<script lang="ts">
	import { onMount } from 'svelte';
	import {
		createBenchmarkEChart,
		readBenchmarkEChartTheme,
		type BenchmarkEChartInstance,
		type BenchmarkEChartOption,
		type BenchmarkEChartTheme
	} from '$lib/benchmark-echart';
	import { cn } from '$lib/utils';

	interface Props {
		ariaLabel: string;
		class?: string;
		createOption: (theme: BenchmarkEChartTheme) => BenchmarkEChartOption;
		dragZoom?: boolean;
	}

	let { ariaLabel, class: className, createOption, dragZoom = false }: Props = $props();
	let container: HTMLDivElement;
	let chart = $state.raw<BenchmarkEChartInstance>();
	let theme = $state.raw<BenchmarkEChartTheme>();
	const option = $derived(theme ? createOption(theme) : undefined);

	$effect(() => {
		if (chart && option) {
			chart.setOption(option, { notMerge: true });
			if (dragZoom) {
				chart.dispatchAction({
					type: 'takeGlobalCursor',
					key: 'dataZoomSelect',
					dataZoomSelectActive: true
				});
			}
		}
	});

	onMount(() => {
		const render = () => {
			if (container.clientWidth <= 0 || container.clientHeight <= 0) return;

			if (!chart) {
				theme = readBenchmarkEChartTheme();
				chart = createBenchmarkEChart(container);
			} else {
				chart.resize();
			}
		};
		const resizeObserver = new ResizeObserver(render);
		const themeObserver = new MutationObserver(() => {
			theme = readBenchmarkEChartTheme();
		});

		resizeObserver.observe(container);
		themeObserver.observe(document.documentElement, {
			attributeFilter: ['class', 'style'],
			attributes: true
		});
		render();

		return () => {
			resizeObserver.disconnect();
			themeObserver.disconnect();
			chart?.dispose();
			chart = undefined;
		};
	});
</script>

<div
	bind:this={container}
	class={cn('relative w-full min-w-0', className)}
	role="img"
	aria-label={ariaLabel}
></div>
