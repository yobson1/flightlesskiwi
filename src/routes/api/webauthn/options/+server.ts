import { WEBAUTHN_RP_ID } from '$app/env/private';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { encodeBase64url } from '#lib/encoding.js';
import { getClientIP } from '#lib/server/auth/api.js';
import { validatePasswordResetSessionRequest } from '#lib/server/auth/password-reset.js';
import { validateLoginAttemptRequest } from '#lib/server/auth/login-attempt.js';
import { RefillingTokenBucket } from '#lib/server/auth/rate-limit.js';
import { getUserPasskeyCredentials, storeWebAuthnChallenge } from '#lib/server/auth/webauthn.js';
import type { WebAuthnChallengePurpose } from '#lib/types/webauthn.js';
import type { RequestEvent } from './$types';
import * as v from 'valibot';

const challengeBucket = new RefillingTokenBucket<string>('webauthn-challenge-ip', 30, 10);
type WebAuthnAuthenticationPurpose = Exclude<WebAuthnChallengePurpose, 'passkey-register'>;
const optionsRequestSchema = v.object({
	purpose: v.picklist(['passkey-login', 'passkey-2fa', 'password-reset-2fa', 'settings-reauth'])
});

export async function POST(event: RequestEvent) {
	if (!challengeBucket.consume(getClientIP(event), 1)) {
		return new Response('Too many requests', { status: 429 });
	}
	let result;
	try {
		result = v.safeParse(optionsRequestSchema, await event.request.json());
	} catch {
		return new Response('Invalid request', { status: 400 });
	}
	if (!result.success) {
		return new Response('Invalid purpose', { status: 400 });
	}
	const purpose: WebAuthnAuthenticationPurpose = result.output.purpose;

	let userId: string | null;
	if (purpose === 'passkey-login') {
		userId = null;
	} else if (purpose === 'password-reset-2fa') {
		const { session, user } = validatePasswordResetSessionRequest(event);
		if (
			session === null ||
			!session.emailVerified ||
			session.twoFactorVerified ||
			!user.registeredPasskey
		) {
			return new Response('Forbidden', { status: 403 });
		}
		userId = user.id;
	} else if (purpose === 'passkey-2fa') {
		const { attempt, user } = validateLoginAttemptRequest(event);
		if (attempt === null || !user.registeredPasskey) {
			return new Response('Forbidden', { status: 403 });
		}
		userId = user.id;
	} else {
		if (event.locals.session === null || event.locals.user === null) {
			return new Response('Not authenticated', { status: 401 });
		}
		if (!event.locals.user.emailVerified) {
			return new Response('Forbidden', { status: 403 });
		}
		if (purpose === 'settings-reauth' && !event.locals.user.registeredPasskey) {
			return new Response('Forbidden', { status: 403 });
		}
		userId = event.locals.user.id;
	}

	const credentials = userId === null ? [] : getUserPasskeyCredentials(userId);
	const options = await generateAuthenticationOptions({
		rpID: WEBAUTHN_RP_ID!,
		allowCredentials:
			userId === null
				? undefined
				: credentials.map((credential) => ({
						id: encodeBase64url(credential.id)
					})),
		userVerification: 'required'
	});

	storeWebAuthnChallenge(options.challenge, userId, purpose);
	return Response.json(options, { headers: { 'cache-control': 'no-store' } });
}
