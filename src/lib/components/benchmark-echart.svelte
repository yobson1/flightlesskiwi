<script lang="ts">
	import { onMount } from 'svelte';
	import { scheduleBenchmarkChartTask } from '$lib/benchmark-chart-scheduler';
	import {
		createBenchmarkEChart,
		readBenchmarkEChartTheme,
		type BenchmarkEChartInstance,
		type BenchmarkEChartOption,
		type BenchmarkEChartTheme
	} from '$lib/benchmark-echart';
	import { cn } from '$lib/utils';
	import type { ElementEvent } from 'zrender';

	interface Props {
		ariaLabel: string;
		class?: string;
		createOption: (theme: BenchmarkEChartTheme) => BenchmarkEChartOption;
		dragZoom?: boolean;
		onImageExporterChange?: (imageExporter: (() => void) | undefined) => void;
	}

	let {
		ariaLabel,
		class: className,
		createOption,
		dragZoom = false,
		onImageExporterChange
	}: Props = $props();
	let container: HTMLDivElement;
	let chart = $state.raw<BenchmarkEChartInstance>();
	let theme = $state.raw<BenchmarkEChartTheme>();
	let prepared = $state(false);
	let latestOption = $state.raw<BenchmarkEChartOption>();
	let appliedOption = $state.raw<BenchmarkEChartOption>();
	const option = $derived(prepared && theme ? createOption(theme) : undefined);
	let mounted = false;
	let renderQueued = false;
	let themeRefreshQueued = false;
	let cancelPreparation: (() => void) | undefined;
	let cancelRender: (() => void) | undefined;
	let cancelThemeRefresh: (() => void) | undefined;
	let resetZoom: ((event: ElementEvent) => void) | undefined;

	function activateDragZoom(instance: BenchmarkEChartInstance) {
		instance.dispatchAction({
			type: 'takeGlobalCursor',
			key: 'dataZoomSelect',
			dataZoomSelectActive: true
		});
	}

	function saveChartImage() {
		if (!chart || !theme) return;

		const imageUrl = chart.getDataURL({
			type: 'png',
			pixelRatio: 2,
			backgroundColor: theme.background,
			excludeComponents: ['toolbox']
		});
		const fileName =
			ariaLabel
				.trim()
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/^-|-$/g, '') || 'benchmark-chart';
		const link = document.createElement('a');
		link.href = imageUrl;
		link.download = `${fileName}.png`;
		link.click();
	}

	function render() {
		if (!latestOption || container.clientWidth <= 0 || container.clientHeight <= 0) {
			return;
		}

		const optionChanged = latestOption !== appliedOption;
		if (!chart) {
			chart = createBenchmarkEChart(container);
			onImageExporterChange?.(saveChartImage);
			if (dragZoom) {
				resetZoom = (event: ElementEvent) => {
					if (!chart?.containPixel({ gridIndex: 0 }, [event.offsetX, event.offsetY])) {
						return;
					}

					chart.dispatchAction({ type: 'dataZoom', start: 0, end: 100 });
					activateDragZoom(chart);
				};
				chart.getZr().on('click', resetZoom);
			}
		} else {
			chart.resize();
		}

		if (optionChanged) {
			chart.setOption(latestOption, { notMerge: true });
			appliedOption = latestOption;
			if (dragZoom) activateDragZoom(chart);
		}
	}

	function queueRender(priority = false) {
		if (!mounted || !latestOption || renderQueued) return;
		renderQueued = true;
		cancelRender = scheduleBenchmarkChartTask(() => {
			renderQueued = false;
			cancelRender = undefined;
			render();
		}, priority);
	}

	function queueThemeRefresh() {
		if (!mounted || themeRefreshQueued) return;
		themeRefreshQueued = true;
		cancelThemeRefresh = scheduleBenchmarkChartTask(() => {
			themeRefreshQueued = false;
			cancelThemeRefresh = undefined;
			theme = readBenchmarkEChartTheme();
			latestOption = option;
			queueRender(true);
		}, true);
	}

	$effect(() => {
		const nextOption = option;
		if (nextOption && nextOption !== latestOption) {
			latestOption = nextOption;
			queueRender(true);
		}
	});

	onMount(() => {
		mounted = true;
		const resizeObserver = new ResizeObserver(() => queueRender(true));
		const themeObserver = new MutationObserver(queueThemeRefresh);

		resizeObserver.observe(container);
		themeObserver.observe(document.documentElement, {
			attributeFilter: ['class', 'style'],
			attributes: true
		});
		cancelPreparation = scheduleBenchmarkChartTask(() => {
			cancelPreparation = undefined;
			theme = readBenchmarkEChartTheme();
			prepared = true;
			latestOption = option;
			render();
		});

		return () => {
			mounted = false;
			resizeObserver.disconnect();
			themeObserver.disconnect();
			cancelPreparation?.();
			cancelRender?.();
			cancelThemeRefresh?.();
			if (resetZoom) chart?.getZr().off('click', resetZoom);
			chart?.dispose();
			chart = undefined;
			appliedOption = undefined;
			onImageExporterChange?.(undefined);
		};
	});
</script>

<div
	bind:this={container}
	class={cn('relative w-full min-w-0', className)}
	role="img"
	aria-label={ariaLabel}
></div>
