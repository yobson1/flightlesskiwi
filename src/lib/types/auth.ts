export const AUTH_MODAL_VIEWS = [
	'login',
	'login-totp',
	'password-reset',
	'signup',
	'verify-email',
	'setup',
	'totp-setup',
	'passkey-register',
	'recovery-code',
	'totp',
	'passkey',
	'reauth'
] as const;

export type AuthModalView = (typeof AUTH_MODAL_VIEWS)[number];

export interface ClientAuthState {
	user: {
		email: string;
		verificationEmail: string;
		username: string;
		emailVerified: boolean;
		registeredTOTP: boolean;
		registeredPasskey: boolean;
		registered2FA: boolean;
		recoveryCodeConfigured: boolean;
	};
	twoFactorVerified: boolean;
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
