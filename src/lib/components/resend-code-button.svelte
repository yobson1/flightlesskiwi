<script lang="ts">
	interface Props {
		availableAt: number;
		pending?: boolean;
		onclick: () => void | Promise<void>;
	}

	let { availableAt, pending = false, onclick }: Props = $props();
	let secondsRemaining = $state(0);

	$effect(() => {
		const deadline = availableAt;
		const update = () => {
			secondsRemaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
		};
		update();
		if (secondsRemaining === 0) return;
		const interval = window.setInterval(update, 250);
		return () => window.clearInterval(interval);
	});

	function formatCountdown(seconds: number): string {
		if (seconds < 60) return `${seconds}s`;
		const minutes = Math.floor(seconds / 60);
		const remainder = seconds % 60;
		return `${minutes}:${String(remainder).padStart(2, '0')}`;
	}
</script>

<button
	type="button"
	class="font-medium text-foreground underline underline-offset-4 hover:text-primary disabled:opacity-50"
	disabled={pending || secondsRemaining > 0}
	{onclick}
>
	{#if pending}
		Sending…
	{:else if secondsRemaining > 0}
		Send another code in {formatCountdown(secondsRemaining)}
	{:else}
		Send another code
	{/if}
</button>
