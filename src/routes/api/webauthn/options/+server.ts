import { WEBAUTHN_RP_ID } from '$app/env/private';
import { json } from '@sveltejs/kit';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { encodeBase64url } from '$lib/encoding';
import { getClientIP } from '$lib/server/auth/api';
import { validatePasswordResetSessionRequest } from '$lib/server/auth/password-reset';
import { RefillingTokenBucket } from '$lib/server/auth/rate-limit';
import { getUserPasskeyCredentials, storeWebAuthnChallenge } from '$lib/server/auth/webauthn';
import type { WebAuthnChallengePurpose } from '$lib/types/webauthn';
import type { RequestEvent } from './$types';

const challengeBucket = new RefillingTokenBucket<string>('webauthn-challenge-ip', 30, 10);
type WebAuthnAuthenticationPurpose = Exclude<WebAuthnChallengePurpose, 'passkey-register'>;
const purposes = new Set<WebAuthnAuthenticationPurpose>([
	'passkey-login',
	'passkey-2fa',
	'password-reset-2fa',
	'settings-reauth'
]);

export async function POST(event: RequestEvent) {
	if (!challengeBucket.consume(getClientIP(event), 1)) {
		return new Response('Too many requests', { status: 429 });
	}
	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return new Response('Invalid request', { status: 400 });
	}
	if (
		typeof body !== 'object' ||
		body === null ||
		!('purpose' in body) ||
		typeof body.purpose !== 'string' ||
		!purposes.has(body.purpose as WebAuthnAuthenticationPurpose)
	) {
		return new Response('Invalid purpose', { status: 400 });
	}
	const purpose = body.purpose as WebAuthnAuthenticationPurpose;

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
	} else {
		if (event.locals.session === null || event.locals.user === null) {
			return new Response('Not authenticated', { status: 401 });
		}
		if (!event.locals.user.emailVerified) {
			return new Response('Forbidden', { status: 403 });
		}
		if (
			purpose === 'passkey-2fa' &&
			(!event.locals.user.registeredPasskey || event.locals.session.twoFactorVerified)
		) {
			return new Response('Forbidden', { status: 403 });
		}
		if (
			purpose === 'settings-reauth' &&
			(!event.locals.user.registeredPasskey || !event.locals.session.twoFactorVerified)
		) {
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
	return json(options, { headers: { 'cache-control': 'no-store' } });
}
