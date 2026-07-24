<script lang="ts">
	import GamepadIcon from '@lucide/svelte/icons/gamepad-2';
	import { resolve } from '$app/paths';
	import { constructImageUrl } from '$lib/igdb';

	interface BenchmarkListing {
		id: string;
		title: string;
		description: string | null;
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

	let description = $derived(benchmark.description?.split(/\r?\n/, 1)[0]?.trim() ?? '');
</script>

<div class="pb-3">
	<a
		href={resolve('/benchmark/[id]', { id: benchmark.id })}
		class="group flex gap-4 rounded-xl border bg-card p-3 text-card-foreground transition-colors hover:bg-accent/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
	>
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
				<h2 class="truncate text-base font-semibold group-hover:underline">
					{benchmark.title}
				</h2>
				<p class="truncate text-sm font-medium text-muted-foreground">
					{benchmark.gameName ?? 'Unknown game'}
				</p>
				{#if description}
					<p class="mt-1 truncate text-sm text-muted-foreground">{description}</p>
				{/if}
			</div>

			<div class="shrink-0 text-xs text-muted-foreground sm:text-right">
				<time datetime={benchmark.createdAt.toISOString()}>
					{dateFormatter.format(benchmark.createdAt)}
				</time>
				<p>by {benchmark.username}</p>
			</div>
		</div>
	</a>
</div>
