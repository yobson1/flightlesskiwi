export type AuthModalView =
	| 'login'
	| 'login-totp'
	| 'signup'
	| 'verify-email'
	| 'setup'
	| 'totp-setup'
	| 'passkey-register'
	| 'recovery-code'
	| 'totp'
	| 'passkey';

export interface ClientAuthState {
	user: {
		email: string;
		username: string;
		emailVerified: boolean;
		registeredTOTP: boolean;
		registeredPasskey: boolean;
		registered2FA: boolean;
		recoveryCodeConfigured: boolean;
	};
	twoFactorVerified: boolean;
}
