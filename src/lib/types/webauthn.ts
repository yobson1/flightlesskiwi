export type WebAuthnChallengePurpose =
	| 'passkey-login'
	| 'passkey-register'
	| 'passkey-2fa'
	| 'password-reset-2fa'
	| 'settings-reauth';
