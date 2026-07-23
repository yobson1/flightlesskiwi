<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import ClipboardIcon from '@lucide/svelte/icons/clipboard';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';

	interface Props {
		onDone: () => void | Promise<void>;
	}

	let { onDone }: Props = $props();
	let code = $state('');
	let message = $state('');
	let copied = $state(false);

	onMount(() => {
		const controller = new AbortController();
		void loadRecoveryCode(controller.signal);
		return () => controller.abort();
	});

	async function loadRecoveryCode(signal?: AbortSignal) {
		message = '';
		try {
			const response = await fetch('/api/auth/recovery-code', { method: 'POST', signal });
			if (!response.ok) throw new Error(await response.text());
			const data = (await response.json()) as { recoveryCode?: unknown };
			if (typeof data.recoveryCode !== 'string') throw new Error('Invalid recovery code response');
			code = data.recoveryCode;
		} catch (cause) {
			if (cause instanceof DOMException && cause.name === 'AbortError') return;
			message = cause instanceof Error ? cause.message : 'Unable to load recovery code';
		}
	}

	async function copyCode() {
		await navigator.clipboard.writeText(code);
		copied = true;
		window.setTimeout(() => (copied = false), 2000);
	}

	async function confirmSaved() {
		message = '';
		try {
			const response = await fetch('/api/auth/recovery-code', { method: 'PUT' });
			if (!response.ok) throw new Error(await response.text());
			await onDone();
		} catch (cause) {
			message = cause instanceof Error ? cause.message : 'Unable to save recovery code';
		}
	}
</script>

<Card.Root>
	<Card.Header>
		<div class="grid grid-cols-[2.25rem_1fr_2.25rem] items-center gap-2">
			<div class="flex size-9 items-center justify-center rounded-full bg-muted">
				<ShieldCheckIcon class="size-4" />
			</div>
			<Card.Title class="text-center">Save your recovery code</Card.Title>
			<span aria-hidden="true"></span>
		</div>
		<Card.Description class="text-center text-balance">
			Store this somewhere safe. It is the only way to recover your account if you lose your second
			factor.
		</Card.Description>
	</Card.Header>
	<Card.Content class="space-y-4">
		{#if code}
			<div class="flex items-center gap-2 rounded-lg border bg-muted/40 p-3">
				<code class="min-w-0 flex-1 text-center font-mono text-sm font-semibold break-all"
					>{code}</code
				>
				<Button variant="ghost" size="icon" aria-label="Copy recovery code" onclick={copyCode}>
					{#if copied}<CheckIcon />{:else}<ClipboardIcon />{/if}
				</Button>
			</div>
			<Button size="lg" class="w-full" onclick={confirmSaved}>I&apos;ve saved it</Button>
		{:else if message}
			<p
				class="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
				role="alert"
			>
				{message}
			</p>
			<Button variant="outline" class="w-full" onclick={() => loadRecoveryCode()}>Try again</Button>
		{:else}
			<div class="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
				<LoaderCircleIcon class="animate-spin" />
				Loading recovery code…
			</div>
		{/if}
	</Card.Content>
</Card.Root>
