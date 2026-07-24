import { getContext, setContext } from 'svelte';
import { AUTH_MODAL_VIEWS, type AuthModalView } from '$lib/types/auth';

const AUTH_MODAL_CONTEXT = Symbol('auth-modal');
const AUTH_MODAL_DATA_ENDPOINTS: Partial<Record<AuthModalView, string>> = {
	'password-reset': '/api/auth/password-reset',
	'totp-setup': '/api/auth/totp-setup',
	'passkey-register': '/api/auth/passkey-registration'
};

export interface AuthModalOpenOptions {
	data?: unknown;
	required?: boolean;
	onClose?: () => void | Promise<void>;
	onComplete?: () => void | Promise<void>;
}

export interface AuthModalController {
	open(view: AuthModalView, options?: AuthModalOpenOptions): Promise<void>;
	close(): Promise<void>;
}

export function provideAuthModal(controller: AuthModalController): void {
	setContext(AUTH_MODAL_CONTEXT, controller);
}

export function getAuthModal(): AuthModalController {
	const controller = getContext<AuthModalController | undefined>(AUTH_MODAL_CONTEXT);
	if (controller === undefined) {
		throw new Error('AuthModalController is not available outside the root layout');
	}
	return controller;
}

const AUTH_MODAL_VIEW_SET: ReadonlySet<string> = new Set(AUTH_MODAL_VIEWS);

export function parseAuthModalHash(hash: string): AuthModalView | null {
	if (hash.length < 2) return null;
	let value: string;
	try {
		value = decodeURIComponent(hash.slice(1));
	} catch {
		return null;
	}
	return AUTH_MODAL_VIEW_SET.has(value) ? (value as AuthModalView) : null;
}

export function authModalHash(view: AuthModalView): string {
	return `#${encodeURIComponent(view)}`;
}

export function authModalDataEndpoint(view: AuthModalView): string | null {
	return AUTH_MODAL_DATA_ENDPOINTS[view] ?? null;
}

export function authModalDataMethod(view: AuthModalView): 'GET' | 'POST' {
	return view === 'password-reset' ? 'GET' : 'POST';
}
