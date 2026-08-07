import type { OAuthProvider } from '$lib/types/oauth';

export const AUTH_MODAL_VIEWS = [
	'login',
	'login-2fa',
	'password-reset',
	'signup',
	'verify-email',
	'setup',
	'totp-setup',
	'passkey-register',
	'recovery-code',
	'reauth'
] as const;

export type AuthModalView = (typeof AUTH_MODAL_VIEWS)[number];

export interface ClientAuthState {
	user: {
		email: string;
		verificationEmail: string;
		username: string;
		emailVerified: boolean;
		hasPassword: boolean;
		registeredTOTP: boolean;
		registeredPasskey: boolean;
		registered2FA: boolean;
		recoveryCodeConfigured: boolean;
		oauthProviders: OAuthProvider[];
	};
}

export interface AuthAPIResponse {
	next: AuthModalView | null;
	message?: string;
	retryAfterSeconds?: number;
	[key: string]: unknown;
}

export interface AuthAPIErrorResponse {
	message: string;
	modal?: AuthModalView;
	reauthenticationRequired?: boolean;
	retryAfterSeconds?: number;
}
