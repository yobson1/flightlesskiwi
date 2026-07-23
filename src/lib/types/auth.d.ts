export type AuthModalView =
	| 'login'
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
	};
	twoFactorVerified: boolean;
}
