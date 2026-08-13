import type { OAuthProvider } from '$lib/types/oauth';
import * as v from 'valibot';

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
export type PasswordResetStage = 'request' | 'email-code' | 'two-factor' | 'password';

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

export const authAPIResponseSchema = v.object({
	next: v.nullable(v.picklist(AUTH_MODAL_VIEWS)),
	message: v.optional(v.string()),
	retryAfterSeconds: v.optional(v.number()),
	sent: v.optional(v.boolean()),
	registeredTOTP: v.optional(v.boolean()),
	registeredPasskey: v.optional(v.boolean()),
	recoveryCode: v.optional(v.string()),
	keyURI: v.optional(v.string()),
	stage: v.optional(v.picklist(['request', 'email-code', 'two-factor', 'password'])),
	email: v.optional(v.string()),
	options: v.optional(v.unknown())
});

export type AuthAPIResponse = v.InferOutput<typeof authAPIResponseSchema>;

export const authAPIErrorResponseSchema = v.object({
	message: v.string(),
	modal: v.optional(v.picklist(AUTH_MODAL_VIEWS)),
	reauthenticationRequired: v.optional(v.boolean()),
	retryAfterSeconds: v.optional(v.number())
});
