<script lang="ts">
	import '../app.css';
	import { invalidateAll, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import favicon from '$lib/assets/favicon.svg';
	import AuthModal from '$lib/components/AuthModal.svelte';
	import Nav from '$lib/components/Nav.svelte';
	import type { AuthModalView } from '$lib/types/auth';
	import { ModeWatcher } from 'mode-watcher';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();
	let authView = $derived<AuthModalView | null>(
		requiredAuthModal(data.auth) ?? routeModal(page.url.pathname)
	);
	let visibleAuth = $derived(data.auth);

	function requiredAuthModal(auth: typeof data.auth): AuthModalView | null {
		if (auth !== null && !auth.user.emailVerified) {
			return 'verify-email';
		}
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

	function routeModal(pathname: string): AuthModalView | null {
		switch (pathname) {
			case '/login':
				return 'login';
			case '/signup':
				return 'signup';
			case '/verify-email':
				return 'verify-email';
			case '/2fa/setup':
				return 'setup';
			case '/2fa/totp/setup':
				return 'totp-setup';
			case '/2fa/passkey/register':
				return 'passkey-register';
			case '/recovery-code':
				return 'recovery-code';
			case '/2fa/totp':
				return 'totp';
			case '/2fa/passkey':
				return 'passkey';
			default:
				return null;
		}
	}

	async function handleAuthRedirect(location: string) {
		await invalidateAll();
		const pathname = new URL(location, page.url).pathname;
		const nextView = routeModal(pathname);

		if (pathname === '/') {
			const requiredView = requiredAuthModal(data.auth);
			if (requiredView !== null) {
				authView = requiredView;
				if (requiredView === 'recovery-code') {
					await goto(resolve('/recovery-code'), { replaceState: true });
				}
				return;
			}
			authView = null;
			if (routeModal(page.url.pathname) !== null) {
				await goto(resolve('/'), { replaceState: true });
			}
			return;
		}
		if (nextView !== null) {
			if (pathname === '/2fa/setup') {
				authView = nextView;
				await goto(resolve('/2fa/setup'));
				return;
			}
			if (pathname === '/2fa/totp/setup') {
				authView = nextView;
				await goto(resolve('/2fa/totp/setup'));
				return;
			}
			if (pathname === '/2fa/passkey/register') {
				authView = nextView;
				await goto(resolve('/2fa/passkey/register'));
				return;
			}
			if (pathname === '/recovery-code') {
				authView = nextView;
				await goto(resolve('/recovery-code'));
				return;
			}
			authView = nextView;
			return;
		}

		authView = null;
		await goto(resolve('/'));
	}

	async function handleModalClose() {
		if (routeModal(page.url.pathname) !== null) {
			await goto(resolve('/'), { replaceState: true });
		}
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>
<ModeWatcher />

<div class="flex min-h-screen flex-col">
	<header class="flex w-full justify-center border-b bg-background/90 backdrop-blur">
		<nav class="flex w-4/5 max-w-7xl min-w-80 items-center justify-between py-2">
			<a href="/" class="flex items-center gap-2">
				<img src={favicon} alt="" class="h-8 w-8" />
				<span class="font-semibold">flightlesskiwi</span>
			</a>
			<Nav
				auth={visibleAuth}
				onOpenLogin={() => (authView = 'login')}
				onOpenSignup={() => (authView = 'signup')}
			/>
		</nav>
	</header>
	<main class="flex flex-1 justify-center px-4 py-8">
		<div class="w-4/5 max-w-7xl min-w-80">
			{@render children?.()}
		</div>
	</main>
	<footer class="w-full p-4 text-center">
		<p>&copy; 2025</p>
	</footer>
</div>

<AuthModal
	bind:view={authView}
	auth={visibleAuth}
	webAuthnRPName={data.webAuthnRPName}
	routeData={page.data}
	onClose={handleModalClose}
	onRedirect={handleAuthRedirect}
/>
