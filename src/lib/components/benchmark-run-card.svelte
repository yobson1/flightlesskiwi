<script lang="ts">
	import CpuIcon from '@lucide/svelte/icons/cpu';
	import FileIcon from '@lucide/svelte/icons/file-chart-column';
	import GpuIcon from '@lucide/svelte/icons/gpu';
	import LaptopIcon from '@lucide/svelte/icons/laptop';
	import MemoryStickIcon from '@lucide/svelte/icons/memory-stick';
	import type { MangoHudSystemInfo } from '$lib/mangohud';

	interface BenchmarkRun {
		originalName: string;
		mangoHud: MangoHudSystemInfo | null;
	}

	interface Props {
		run: BenchmarkRun;
	}

	let { run }: Props = $props();

	function formatMemory(ramKiB: number | null): string {
		if (ramKiB === null) return 'Unknown memory';
		const gibibytes = ramKiB / (1024 * 1024);
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

	{#if run.mangoHud}
		<dl class="mt-3 space-y-1.5 text-sm">
			<div class="flex min-w-0 items-center gap-2">
				<CpuIcon class="size-4 shrink-0 text-muted-foreground" />
				<dt class="sr-only">CPU and memory</dt>
				<dd
					class="flex min-w-0 flex-1 items-center gap-1.5"
					title={`${run.mangoHud.cpu || 'Unknown CPU'} · ${formatMemory(run.mangoHud.ramKiB)}`}
				>
					<span class="truncate">{run.mangoHud.cpu || 'Unknown CPU'}</span>
					<span class="shrink-0 text-muted-foreground">·</span>
					<MemoryStickIcon class="size-3.5 shrink-0 text-muted-foreground" />
					<span class="shrink-0">{formatMemory(run.mangoHud.ramKiB)}</span>
				</dd>
			</div>

			<div class="flex min-w-0 items-center gap-2">
				<GpuIcon class="size-4 shrink-0 text-muted-foreground" />
				<dt class="sr-only">GPU</dt>
				<dd
					class="truncate"
					title={`${run.mangoHud.gpu || 'Unknown GPU'}${run.mangoHud.driver ? ` · ${run.mangoHud.driver}` : ''}`}
				>
					{run.mangoHud.gpu || 'Unknown GPU'}
					{#if run.mangoHud.driver}
						<span class="text-muted-foreground"> · {run.mangoHud.driver}</span>
					{/if}
				</dd>
			</div>

			<div class="flex min-w-0 items-center gap-2">
				<LaptopIcon class="size-4 shrink-0 text-muted-foreground" />
				<dt class="sr-only">Operating system</dt>
				<dd
					class="truncate"
					title={`${run.mangoHud.os || 'Unknown OS'}${run.mangoHud.kernel ? ` · ${run.mangoHud.kernel}` : ''}${run.mangoHud.cpuScheduler ? ` · ${run.mangoHud.cpuScheduler}` : ''}`}
				>
					{run.mangoHud.os || 'Unknown OS'}
					{#if run.mangoHud.kernel}
						<span class="text-muted-foreground"> · {run.mangoHud.kernel}</span>
					{/if}
					{#if run.mangoHud.cpuScheduler}
						<span class="text-muted-foreground"> · {run.mangoHud.cpuScheduler}</span>
					{/if}
				</dd>
			</div>
		</dl>
	{:else}
		<p class="mt-4 text-sm text-muted-foreground">MangoHud configuration not detected.</p>
	{/if}
</div>
