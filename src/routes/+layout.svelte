<script lang="ts">
	import '../app.css';
	import { browser } from '$app/env';
	import { invalidateAll, replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { decodeBase64 } from '@oslojs/encoding';
	import { onMount, untrack } from 'svelte';
	import { SvelteURL } from 'svelte/reactivity';
	import { toast } from 'svelte-sonner';
	import SimpleIconsGithub from '~icons/simple-icons/github';
	import favicon from '$lib/assets/favicon.svg';
	import {
		authModalDataEndpoint,
		authModalDataMethod,
		authModalHash,
		parseAuthModalHash,
		provideAuthModal,
		type AuthModalOpenOptions
	} from '$lib/auth-modal';
	import { authRequest, AuthAPIError } from '$lib/client/auth-api';
	import { setupNavigationCursor } from '$lib/client/navigation-cursor';
	import AuthModal from '$lib/components/auth-modal.svelte';
	import Nav from '$lib/components/nav.svelte';
	import { Separator } from '$lib/components/ui/separator';
	import { Toaster } from '$lib/components/ui/sonner/index.js';
	import Wordmark from '$lib/components/wordmark.svelte';
	import type { AuthModalView, ClientAuthState } from '$lib/types/auth';
	import { ModeWatcher } from 'mode-watcher';
	import type { LayoutProps } from './$types';

	type ModalSource = 'hash' | 'programmatic' | 'required';

	let { children, data }: LayoutProps = $props();
	const initialView = untrack(() => requiredAuthModal(data.auth));
	let authView = $state<AuthModalView | null>(initialView);
	let requestedView = $state<AuthModalView | null>(initialView);
	let authViewData = $state<unknown>(null);
	let authRequired = $state(initialView !== null);
	let modalOptions = $state<AuthModalOpenOptions>({});
	let returnHash = $state('');
	let modalRequestId = 0;
	let visibleAuth = $derived(data.auth);
	const currentYear = new Date().getFullYear();

	setupNavigationCursor();

	provideAuthModal({
		open: (view, options) => openAuthModal(view, options),
		close: closeAuthModal
	});

	$effect(() => {
		const requiredView = requiredAuthModal(data.auth);
		if (requiredView !== null) {
			if (authView !== requiredView || !authRequired) {
				void openAuthModal(requiredView, { required: true }, 'required');
			}
		} else if (authRequired && authView !== 'reauth') {
			authRequired = false;
		}
	});

	onMount(() => {
		const fragmentView = parseAuthModalHash(window.location.hash);
		if (fragmentView === null && authRequired && authView !== null) {
			returnHash = window.location.hash;
			setModalFragment(authView);
		} else {
			syncModalFromHash();
		}
		window.addEventListener('hashchange', syncModalFromHash);
		return () => window.removeEventListener('hashchange', syncModalFromHash);
	});

	function requiredAuthModal(auth: ClientAuthState | null): AuthModalView | null {
		if (auth !== null && !auth.user.emailVerified) return 'verify-email';
		if (
			auth !== null &&
			auth.user.registeredTOTP &&
			auth.twoFactorVerified &&
			!auth.user.recoveryCodeConfigured
		) {
			return 'recovery-code';
		}
		return null;
	}

	function normalizeRequestedView(
		view: AuthModalView,
		auth: ClientAuthState | null
	): AuthModalView | null {
		const required = requiredAuthModal(auth);
		if (required !== null) return required;
		if (view === 'login-totp') return auth === null ? view : null;
		if (view === 'login' || view === 'signup' || view === 'password-reset') {
			return auth === null ? view : null;
		}
		if (auth === null) return 'login';
		if (view === 'verify-email') return null;
		if (view === 'recovery-code') return null;
		if (view === 'totp' && !auth.user.registeredTOTP) {
			return auth.user.registeredPasskey ? 'passkey' : 'setup';
		}
		if (view === 'passkey' && !auth.user.registeredPasskey) {
			return auth.user.registeredTOTP ? 'totp' : 'setup';
		}
		return view;
	}

	function syncModalFromHash() {
		const fragmentView = parseAuthModalHash(window.location.hash);
		if (fragmentView !== null) {
			void openAuthModal(fragmentView, {}, 'hash');
		} else if (!authRequired) {
			clearModalState(false);
		}
	}

	async function openAuthModal(
		requested: AuthModalView,
		options: AuthModalOpenOptions = {},
		source: ModalSource = 'programmatic'
	) {
		const view = normalizeRequestedView(requested, data.auth);
		if (view === null) {
			await closeAuthModal();
			return;
		}
		const requestId = ++modalRequestId;
		if (
			browser &&
			source !== 'hash' &&
			authView === null &&
			parseAuthModalHash(window.location.hash) === null
		) {
			returnHash = window.location.hash;
		}

		requestedView = view;
		authView = view;
		authViewData = options.data ?? null;
		authRequired = options.required ?? view === requiredAuthModal(data.auth);
		modalOptions = options;
		if (source !== 'hash' || view !== requested) setModalFragment(view);
		if (options.data !== undefined || !needsViewData(view)) return;

		try {
			const loadedData = await loadAuthModalData(view);
			if (requestId === modalRequestId && authView === view) authViewData = loadedData;
		} catch (cause) {
			if (requestId !== modalRequestId) return;
			if (cause instanceof AuthAPIError && cause.modal !== null) {
				await openAuthModal(cause.modal);
				return;
			}
			if (cause instanceof AuthAPIError && cause.reauthenticationRequired) {
				authView = 'reauth';
				authViewData = null;
				authRequired = false;
				return;
			}
			clearModalState();
			toast.error(cause instanceof Error ? cause.message : 'Unable to open authentication');
		}
	}

	async function loadAuthModalData(view: AuthModalView): Promise<unknown> {
		const endpoint = authModalDataEndpoint(view);
		if (endpoint === null) return null;
		const response = await authRequest(endpoint, { method: authModalDataMethod(view) });
		if (view === 'totp-setup') return response;
		if (view === 'password-reset') return response;
		return passkeyViewData(response);
	}

	function passkeyViewData(value: unknown): unknown {
		if (typeof value !== 'object' || value === null) {
			throw new Error('Invalid passkey registration response');
		}
		const values = value as Record<string, unknown>;
		if (
			typeof values.username !== 'string' ||
			typeof values.credentialUserId !== 'string' ||
			!Array.isArray(values.excludedCredentialIds) ||
			!values.excludedCredentialIds.every((id) => typeof id === 'string')
		) {
			throw new Error('Invalid passkey registration response');
		}
		return {
			user: { username: values.username },
			credentialUserId: decodeBase64(values.credentialUserId),
			credentials: values.excludedCredentialIds.map((id) => ({
				id: decodeBase64(id as string)
			}))
		};
	}

	function needsViewData(view: AuthModalView): boolean {
		return authModalDataEndpoint(view) !== null;
	}

	async function handleComplete(next: AuthModalView | null) {
		const completedView = authView;
		const continuation = modalOptions.onComplete;
		await invalidateAll();
		if (
			completedView === 'reauth' &&
			next === null &&
			requestedView !== null &&
			needsViewData(requestedView)
		) {
			await openAuthModal(requestedView, modalOptions);
			return;
		}
		if (next !== null) {
			await openAuthModal(next);
			return;
		} else {
			clearModalState();
		}
		if (completedView === 'reauth') await continuation?.();
	}

	async function handleViewChange(view: AuthModalView) {
		await openAuthModal(view, {
			required: modalOptions.required,
			onClose: modalOptions.onClose,
			onComplete: modalOptions.onComplete
		});
	}

	async function closeAuthModal() {
		if (authRequired) return;
		const onClose = modalOptions.onClose;
		clearModalState();
		await onClose?.();
	}

	function clearModalState(updateFragment = true) {
		modalRequestId++;
		authView = null;
		requestedView = null;
		authViewData = null;
		authRequired = false;
		modalOptions = {};
		if (updateFragment) setModalFragment(null);
	}

	function setModalFragment(view: AuthModalView | null) {
		if (!browser) return;
		const url = new SvelteURL(window.location.href);
		url.hash = view === null ? returnHash : authModalHash(view);
		replaceState(resolve(`${url.pathname}${url.search}${url.hash}` as '/'), page.state);
		if (view === null) returnHash = '';
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>
<ModeWatcher />
<Toaster richColors position="top-right" />

<div class="flex min-h-screen flex-col">
	<header class="flex w-full justify-center bg-background/90 backdrop-blur">
		<nav class="mx-2 flex w-full max-w-7xl min-w-80 items-center justify-between py-2">
			<a href="/">
				<Wordmark />
			</a>
			<Nav auth={visibleAuth} />
		</nav>
	</header>
	<Separator />
	<main class="flex flex-1 justify-center px-4 py-8">
		<div class="w-full max-w-7xl">
			{@render children?.()}
		</div>
	</main>
	<footer class="w-full text-muted-foreground">
		<Separator />
		<div class="mx-auto flex w-full max-w-7xl items-center justify-between p-4">
			<p>&copy; {currentYear} flightlesskiwi</p>
			<nav class="flex items-center gap-4" aria-label="Footer">
				<a href="/status" class="text-sm transition-colors hover:text-foreground"> Status </a>
				<a href="/help" class="text-sm transition-colors hover:text-foreground"> About </a>
				<a
					href="https://github.com/yobson1/flightlesskiwi"
					target="_blank"
					rel="noopener noreferrer"
					aria-label="flightlesskiwi on GitHub"
					class="transition-colors hover:text-foreground"
				>
					<SimpleIconsGithub class="size-5" />
				</a>
			</nav>
		</div>
	</footer>
</div>

<AuthModal
	view={authView}
	auth={visibleAuth}
	webAuthnRPName={data.webAuthnRPName}
	viewData={authViewData}
	required={authRequired}
	onViewChange={handleViewChange}
	onClose={closeAuthModal}
	onComplete={handleComplete}
/>
