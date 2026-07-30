import { getContext, setContext } from 'svelte';

const AUTH_TURNSTILE_CONTEXT = Symbol('auth-turnstile');

export interface AuthTurnstileContext {
	siteKey: string | null;
	onToken(token: string): void;
	onError(message: string): void;
	onResetReady(reset: (() => void) | null): void;
}

export function provideAuthTurnstile(context: AuthTurnstileContext): void {
	setContext(AUTH_TURNSTILE_CONTEXT, context);
}

export function getAuthTurnstile(): AuthTurnstileContext {
	const context = getContext<AuthTurnstileContext | undefined>(AUTH_TURNSTILE_CONTEXT);
	if (!context) throw new Error('AuthTurnstileContext is not available outside the auth modal');
	return context;
}
