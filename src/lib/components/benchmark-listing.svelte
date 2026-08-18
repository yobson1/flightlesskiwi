<script lang="ts">
	import CpuIcon from '@lucide/svelte/icons/cpu';
	import GamepadIcon from '@lucide/svelte/icons/gamepad-2';
	import GpuIcon from '@lucide/svelte/icons/gpu';
	import { resolve } from '$app/paths';
	import { constructImageUrl } from '$lib/igdb';

	interface BenchmarkListing {
		id: string;
		title: string;
		cpus: string[];
		gpus: string[];
		createdAt: Date;
		username: string;
		gameName: string | null;
		coverImgId: string | null;
	}

	interface Props {
		benchmark: BenchmarkListing;
	}

	let { benchmark }: Props = $props();

	const dateFormatter = new Intl.DateTimeFormat('en', {
		dateStyle: 'medium',
		timeZone: 'UTC'
	});
</script>

<div class="pb-3">
	<div
		class="group relative flex gap-4 rounded-xl border bg-card p-3 text-card-foreground transition-colors hover:bg-accent/50"
	>
		<a
			href={resolve('/benchmark/[id]', { id: benchmark.id })}
			class="absolute inset-0 rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
		>
			<span class="sr-only">View {benchmark.title}</span>
		</a>
		{#if benchmark.coverImgId}
			<img
				src={constructImageUrl(benchmark.coverImgId, 'cover_small')}
				alt=""
				class="h-20 w-15 shrink-0 rounded-md object-cover"
			/>
		{:else}
			<div
				class="flex h-20 w-15 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
			>
				<GamepadIcon class="size-5" />
			</div>
		{/if}

		<div class="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:justify-between">
			<div class="min-w-0 flex-1">
				<h2 class="truncate text-base leading-tight font-semibold group-hover:underline">
					{benchmark.title}
				</h2>
				<p class="truncate text-sm leading-tight font-medium text-muted-foreground">
					{benchmark.gameName ?? 'Unknown game'}
				</p>
				{#if benchmark.cpus.length || benchmark.gpus.length}
					<div class="mt-2">
						{#if benchmark.cpus.length}
							<p
								class="flex min-w-0 items-center gap-1 text-xs text-muted-foreground"
								title={benchmark.cpus.join(' · ')}
							>
								<CpuIcon class="size-3.5 shrink-0" />
								<span class="truncate">{benchmark.cpus.join(' · ')}</span>
							</p>
						{/if}
						{#if benchmark.gpus.length}
							<p
								class="flex min-w-0 items-center gap-1 text-xs text-muted-foreground"
								title={benchmark.gpus.join(' · ')}
							>
								<GpuIcon class="size-3.5 shrink-0" />
								<span class="truncate">{benchmark.gpus.join(' · ')}</span>
							</p>
						{/if}
					</div>
				{/if}
			</div>

			<div class="shrink-0 text-xs text-muted-foreground sm:text-right">
				<time datetime={benchmark.createdAt.toISOString()}>
					{dateFormatter.format(benchmark.createdAt)}
				</time>
				<p class="relative z-10">
					by
					<a
						href={resolve('/profile/[username]', { username: benchmark.username })}
						class="font-medium hover:text-foreground hover:underline focus-visible:rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
					>
						{benchmark.username}
					</a>
				</p>
			</div>
		</div>
	</div>
</div>
