<script lang="ts">
	import CpuIcon from '@lucide/svelte/icons/cpu';
	import FileIcon from '@lucide/svelte/icons/file-chart-column';
	import GpuIcon from '@lucide/svelte/icons/gpu';
	import LaptopIcon from '@lucide/svelte/icons/laptop';
	import MemoryStickIcon from '@lucide/svelte/icons/memory-stick';
	import type { BenchmarkRun as ParsedBenchmarkRun } from '$lib/benchmark-run';

	interface BenchmarkRun {
		originalName: string;
		benchmarkRun: ParsedBenchmarkRun | null;
	}

	interface Props {
		run: BenchmarkRun;
	}

	let { run }: Props = $props();

	function formatMemory(ramBytes: number | null, description: string): string {
		if (description) return description;
		if (ramBytes === null) return 'Unknown memory';
		const gibibytes = ramBytes / 1024 ** 3;
		return `${gibibytes.toFixed(gibibytes < 10 ? 1 : 0).replace(/\.0$/, '')} GiB`;
	}
</script>

<div class="min-w-0 rounded-xl border bg-card p-3 text-card-foreground">
	<div class="flex min-w-0 items-center gap-2">
		<FileIcon class="size-4 shrink-0 text-primary" />
		<h3 class="truncate text-sm font-semibold" title={run.originalName}>
			{run.originalName}
		</h3>
	</div>

	{#if run.benchmarkRun}
		{@const systemInfo = run.benchmarkRun.systemInfo}
		<dl class="mt-3 space-y-1.5 text-sm">
			<div class="flex min-w-0 items-center gap-2">
				<CpuIcon class="size-4 shrink-0 text-muted-foreground" />
				<dt class="sr-only">CPU and memory</dt>
				<dd
					class="flex min-w-0 flex-1 items-center gap-1.5"
					title={`${systemInfo.cpu || 'Unknown CPU'} · ${formatMemory(systemInfo.ramBytes, systemInfo.ramDescription)}`}
				>
					<span class="truncate">{systemInfo.cpu || 'Unknown CPU'}</span>
					<span class="shrink-0 text-muted-foreground">·</span>
					<MemoryStickIcon class="size-3.5 shrink-0 text-muted-foreground" />
					<span class="shrink-0"
						>{formatMemory(systemInfo.ramBytes, systemInfo.ramDescription)}</span
					>
				</dd>
			</div>

			<div class="flex min-w-0 items-center gap-2">
				<GpuIcon class="size-4 shrink-0 text-muted-foreground" />
				<dt class="sr-only">GPU</dt>
				<dd
					class="truncate"
					title={`${systemInfo.gpu || 'Unknown GPU'}${systemInfo.driver ? ` · ${systemInfo.driver}` : ''}`}
				>
					{systemInfo.gpu || 'Unknown GPU'}
					{#if systemInfo.driver}
						<span class="text-muted-foreground"> · {systemInfo.driver}</span>
					{/if}
				</dd>
			</div>

			<div class="flex min-w-0 items-center gap-2">
				<LaptopIcon class="size-4 shrink-0 text-muted-foreground" />
				<dt class="sr-only">Operating system</dt>
				<dd
					class="truncate"
					title={`${systemInfo.os || 'Unknown OS'}${systemInfo.kernel ? ` · ${systemInfo.kernel}` : ''}${systemInfo.cpuScheduler ? ` · ${systemInfo.cpuScheduler}` : ''}`}
				>
					{systemInfo.os || 'Unknown OS'}
					{#if systemInfo.kernel}
						<span class="text-muted-foreground"> · {systemInfo.kernel}</span>
					{/if}
					{#if systemInfo.cpuScheduler}
						<span class="text-muted-foreground"> · {systemInfo.cpuScheduler}</span>
					{/if}
				</dd>
			</div>
		</dl>
	{:else}
		<p class="mt-4 text-sm text-muted-foreground">Supported benchmark data not detected.</p>
	{/if}
</div>
