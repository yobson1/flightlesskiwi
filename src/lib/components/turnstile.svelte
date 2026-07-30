<script module lang="ts">
	const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
	let scriptPromise: Promise<void> | null = null;

	function loadTurnstile(): Promise<void> {
		if (window.turnstile) return Promise.resolve();
		if (scriptPromise) return scriptPromise;

		scriptPromise = new Promise((resolve, reject) => {
			const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_URL}"]`);
			const script = existing ?? document.createElement('script');
			const loaded = () => {
				if (window.turnstile) resolve();
				else reject(new Error('Turnstile did not load'));
			};
			script.addEventListener('load', loaded, { once: true });
			script.addEventListener('error', () => reject(new Error('Unable to load Turnstile')), {
				once: true
			});
			if (!existing) {
				script.src = SCRIPT_URL;
				script.async = true;
				script.defer = true;
				document.head.append(script);
			}
		});
		return scriptPromise;
	}
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { TURNSTILE_ACTION } from '$lib/turnstile';

	interface Props {
		siteKey?: string | null;
		align?: 'start' | 'center';
		appearance?: 'always' | 'execute' | 'interaction-only';
		onToken?: (token: string) => void;
		onError?: (message: string) => void;
		onInteractiveChange?: (interactive: boolean) => void;
		onResetReady?: (reset: (() => void) | null) => void;
	}

	let {
		siteKey = null,
		align = 'center',
		appearance = 'interaction-only',
		onToken,
		onError,
		onInteractiveChange,
		onResetReady
	}: Props = $props();
	let container = $state<HTMLDivElement>();
	let widgetId: string | null = null;

	onMount(() => {
		if (!siteKey) return;
		let active = true;
		onInteractiveChange?.(appearance === 'always');

		void loadTurnstile()
			.then(() => {
				if (!active) return;
				if (!container) throw new Error('Turnstile container is unavailable');
				widgetId = window.turnstile!.render(container, {
					sitekey: siteKey,
					action: TURNSTILE_ACTION,
					theme: 'auto',
					appearance,
					callback: (value) => {
						onToken?.(value);
						onInteractiveChange?.(false);
					},
					'expired-callback': () => {
						reset();
					},
					'error-callback': () => {
						onToken?.('');
						onError?.('Unable to complete the verification challenge');
					},
					'before-interactive-callback': () => {
						onInteractiveChange?.(true);
					},
					'after-interactive-callback': () => {
						onInteractiveChange?.(false);
					}
				});
				onResetReady?.(reset);
			})
			.catch((cause) => {
				if (!active) return;
				onError?.(cause instanceof Error ? cause.message : 'Unable to load Turnstile');
			});

		return () => {
			active = false;
			onInteractiveChange?.(false);
			onError?.('Verification challenge cancelled');
			onResetReady?.(null);
			if (widgetId !== null && window.turnstile) window.turnstile.remove(widgetId);
		};
	});

	function reset(): void {
		onToken?.('');
		if (widgetId !== null) window.turnstile?.reset(widgetId);
	}
</script>

{#if siteKey}
	<div
		bind:this={container}
		class="cf-turnstile flex"
		class:justify-center={align === 'center'}
		class:justify-start={align === 'start'}
		data-sitekey={siteKey}
		data-action="turnstile-spin-v2"
		data-appearance={appearance}
	></div>
{/if}
