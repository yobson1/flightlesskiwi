import { getContext, setContext } from 'svelte';
import { authModalViewSchema, type AuthAPIResponse, type AuthModalView } from '#lib/types/auth.js';
import * as v from 'valibot';

const AUTH_MODAL_CONTEXT = Symbol('auth-modal');
const AUTH_MODAL_DATA_ENDPOINTS = {
	'login-2fa': '/api/auth/login',
	'password-reset': '/api/auth/password-reset',
	'totp-setup': '/api/auth/totp-setup',
	'passkey-register': '/api/auth/passkey-registration'
} as const satisfies Partial<Record<AuthModalView, string>>;

export interface AuthModalOpenOptions {
	data?: AuthAPIResponse;
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

export function parseAuthModalHash(hash: string): AuthModalView | null {
	if (hash.length < 2) return null;
	let value: string;
	try {
		value = decodeURIComponent(hash.slice(1));
	} catch {
		return null;
	}
	const result = v.safeParse(authModalViewSchema, value);
	return result.success ? result.output : null;
}

export function authModalHash(view: AuthModalView): string {
	return `#${encodeURIComponent(view)}`;
}

export function authModalDataEndpoint(view: AuthModalView): string | null {
	switch (view) {
		case 'login-2fa':
		case 'password-reset':
		case 'totp-setup':
		case 'passkey-register':
			return AUTH_MODAL_DATA_ENDPOINTS[view];
		default:
			return null;
	}
}

export function authModalDataMethod(view: AuthModalView): 'GET' | 'POST' {
	return view === 'password-reset' || view === 'login-2fa' ? 'GET' : 'POST';
}
