<script lang="ts">
	import ImageDownIcon from '@lucide/svelte/icons/image-down';
	import type { BenchmarkEChartOption, BenchmarkEChartTheme } from '#lib/benchmark-echart.js';
	import BenchmarkEChart from '#lib/components/benchmark-echart.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { cn } from '#lib/utils.js';

	interface Props {
		title: string;
		description: string;
		chartClass: string;
		ariaLabel: string;
		createOption: (theme: BenchmarkEChartTheme) => BenchmarkEChartOption;
		dragZoom?: boolean;
	}

	let {
		title,
		description,
		chartClass,
		ariaLabel,
		createOption,
		dragZoom = false
	}: Props = $props();

	let imageExporter = $state<() => void>();

	function setImageExporter(exporter: (() => void) | undefined) {
		imageExporter = exporter;
	}
</script>

<article class="rounded-xl border bg-card p-4">
	<div class="flex items-start justify-between gap-4">
		<div class="min-w-0">
			<h3 class="font-semibold">{title}</h3>
			<p class="text-sm text-muted-foreground">{description}</p>
		</div>
		<Button
			type="button"
			variant="outline"
			size="icon-sm"
			class="shrink-0"
			aria-label={`Save ${title} chart as an image`}
			title="Save chart as image"
			disabled={!imageExporter}
			onclick={() => imageExporter?.()}
		>
			<ImageDownIcon />
		</Button>
	</div>

	<div class={cn('mt-4 w-full', chartClass)}>
		<BenchmarkEChart
			{ariaLabel}
			class="h-full"
			{createOption}
			{dragZoom}
			onImageExporterChange={setImageExporter}
		/>
	</div>
</article>
