<script lang="ts">
	import ClockIcon from '@lucide/svelte/icons/clock';
	import DatabaseIcon from '@lucide/svelte/icons/database';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import { invalidate } from '$app/navigation';
	import { toString as describeCron } from 'cronstrue';
	import { onMount } from 'svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import type { IgdbImportPhase } from '#lib/igdb.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let refreshing = false;

	const activeImport = $derived(data.importStatus.activeImport);
	const scheduleDescription = $derived(
		formatSchedule(data.importStatus.schedule, data.importStatus.timeZone)
	);
	const progressPercent = $derived(
		activeImport?.totalGames
			? Math.min(100, (activeImport.importedGames / activeImport.totalGames) * 100)
			: 0
	);

	onMount(() => {
		const refresh = async () => {
			if (refreshing) return;
			refreshing = true;
			try {
				await invalidate('igdb:imports');
			} finally {
				refreshing = false;
			}
		};
		const interval = window.setInterval(() => void refresh(), 5000);
		return () => window.clearInterval(interval);
	});

	function formatTimestamp(timestamp: string | null) {
		if (timestamp === null) return 'Not yet';
		return new Intl.DateTimeFormat('en-GB', {
			dateStyle: 'medium',
			timeStyle: 'long',
			timeZone: data.importStatus.timeZone
		}).format(new Date(timestamp));
	}

	function formatSchedule(schedule: string, timeZone: string) {
		try {
			const description = describeCron(schedule, {
				throwExceptionOnParseError: true,
				use24HourTimeFormat: true,
				verbose: true
			}).replace(/^At (.+), every day$/, 'Every day at $1');
			return `${description} ${timeZone}`;
		} catch {
			return `${schedule} (${timeZone})`;
		}
	}

	function phaseLabel(phase: IgdbImportPhase) {
		switch (phase) {
			case 'preparing':
				return 'Preparing search index';
			case 'checking':
				return 'Checking for updates';
			case 'importing':
				return 'Importing games';
			case 'finalizing':
				return 'Finalizing import';
		}
	}
</script>

<svelte:head>
	<title>Import status · flightlesskiwi</title>
	<meta
		name="description"
		content="Current and scheduled IGDB game import status for flightlesskiwi."
	/>
</svelte:head>

<div class="flex flex-col gap-8">
	<header>
		<p class="text-sm font-medium text-primary">System status</p>
		<h1 class="text-3xl font-bold tracking-tight">IGDB imports</h1>
		<p class="mt-2 max-w-3xl text-muted-foreground">
			Updated game metadata is imported on a recurring schedule.
		</p>
	</header>

	<section class="grid gap-4 sm:grid-cols-2" aria-label="Import schedule summary">
		<Card.Root>
			<Card.Header>
				<Card.Description>Import schedule</Card.Description>
				<Card.Title class="text-xl">{scheduleDescription}</Card.Title>
			</Card.Header>
			<Card.Content class="flex items-center gap-2 text-muted-foreground">
				<ClockIcon class="size-4" />
				<code class="text-xs">{data.importStatus.schedule}</code>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Description>Last successful import</Card.Description>
				<Card.Title class="text-xl">
					{formatTimestamp(data.importStatus.lastSuccessfulImportAt)}
				</Card.Title>
			</Card.Header>
			<Card.Content class="flex items-center gap-2 text-muted-foreground">
				<DatabaseIcon class="size-4" />
				<span>Latest completed IGDB sync window</span>
			</Card.Content>
		</Card.Root>
	</section>

	<section class="space-y-4" aria-labelledby="pending-heading">
		<div>
			<h2 id="pending-heading" class="text-2xl font-semibold tracking-tight">Pending imports</h2>
			<p class="mt-1 text-muted-foreground">The next import waiting on the scheduler.</p>
		</div>

		<Card.Root>
			<Card.Header>
				<Card.Title class="flex items-center gap-2">
					<ClockIcon class="size-5" />
					Next scheduled import
				</Card.Title>
				<Card.Description>
					{#if data.importStatus.nextImportAt}
						{formatTimestamp(data.importStatus.nextImportAt)}
					{:else if activeImport}
						The next run will be scheduled when the active import finishes.
					{:else}
						No import is currently scheduled.
					{/if}
				</Card.Description>
				{#if data.importStatus.nextImportAt}
					<Card.Action><Badge variant="outline">Pending</Badge></Card.Action>
				{/if}
			</Card.Header>
		</Card.Root>
	</section>

	<section class="space-y-4" aria-labelledby="active-heading">
		<div>
			<h2 id="active-heading" class="text-2xl font-semibold tracking-tight">Imports in progress</h2>
			<p class="mt-1 text-muted-foreground">Live progress for the current IGDB import.</p>
		</div>

		<Card.Root>
			{#if activeImport}
				<Card.Header>
					<Card.Title class="flex items-center gap-2">
						<LoaderCircleIcon class="size-5 animate-spin" />
						{phaseLabel(activeImport.phase)}
					</Card.Title>
					<Card.Description>
						Started {formatTimestamp(activeImport.startedAt)}
					</Card.Description>
					<Card.Action><Badge>In progress</Badge></Card.Action>
				</Card.Header>
				<Card.Content class="space-y-5">
					{#if activeImport.totalGames !== null}
						<div class="space-y-2">
							<div class="flex items-center justify-between text-sm">
								<span>{activeImport.importedGames.toLocaleString('en-GB')} imported</span>
								<span class="text-muted-foreground">
									{activeImport.pendingGames?.toLocaleString('en-GB') ?? 0} pending
								</span>
							</div>
							<div
								class="h-2 overflow-hidden rounded-full bg-muted"
								role="progressbar"
								aria-label="IGDB import progress"
								aria-valuemin="0"
								aria-valuemax={activeImport.totalGames}
								aria-valuenow={activeImport.importedGames}
							>
								<div
									class="h-full rounded-full bg-primary transition-[width]"
									style:width={`${progressPercent}%`}
								></div>
							</div>
							<p class="text-right text-xs text-muted-foreground">
								{activeImport.totalGames.toLocaleString('en-GB')} total games
							</p>
						</div>
					{:else}
						<p class="text-muted-foreground">
							Preparing the import and checking how many games have changed.
						</p>
					{/if}

					{#if activeImport.syncThrough}
						<dl class="grid gap-3 border-t pt-4 text-sm sm:grid-cols-2">
							<div>
								<dt class="text-muted-foreground">Updates from</dt>
								<dd class="mt-1 font-medium">
									{activeImport.syncFrom
										? formatTimestamp(activeImport.syncFrom)
										: 'Beginning of IGDB history'}
								</dd>
							</div>
							<div>
								<dt class="text-muted-foreground">Updates through</dt>
								<dd class="mt-1 font-medium">{formatTimestamp(activeImport.syncThrough)}</dd>
							</div>
						</dl>
					{/if}
				</Card.Content>
			{:else}
				<Card.Header>
					<Card.Title>No import in progress</Card.Title>
					<Card.Description>
						The importer is idle and will start at the next scheduled time.
					</Card.Description>
					<Card.Action><Badge variant="secondary">Idle</Badge></Card.Action>
				</Card.Header>
			{/if}
		</Card.Root>
	</section>

	{#if data.importStatus.lastFailure}
		<section aria-labelledby="failure-heading">
			<Card.Root class="ring-destructive/30">
				<Card.Header>
					<Card.Title id="failure-heading" class="flex items-center gap-2 text-destructive">
						<TriangleAlertIcon class="size-5" />
						Last import failed
					</Card.Title>
					<Card.Description>
						{formatTimestamp(data.importStatus.lastFailure.failedAt)}
					</Card.Description>
				</Card.Header>
				<Card.Content>
					<p class="text-sm text-destructive">
						The current sync window will be retried at the next scheduled import.
					</p>
				</Card.Content>
			</Card.Root>
		</section>
	{/if}
</div>
