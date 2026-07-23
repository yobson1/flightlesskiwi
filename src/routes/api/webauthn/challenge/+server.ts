import { encodeBase64 } from '@oslojs/encoding';
import { json } from '@sveltejs/kit';
import { isSessionRecentlyReauthenticated } from '$lib/server/auth';
import { validatePasswordResetSessionRequest } from '$lib/server/auth/password-reset';
import { RefillingTokenBucket } from '$lib/server/auth/rate-limit';
import { getClientIP } from '$lib/server/auth/routes';
import { createWebAuthnChallenge } from '$lib/server/auth/webauthn';
import type { WebAuthnChallengePurpose } from '$lib/types/webauthn';
import type { RequestEvent } from './$types';

const challengeBucket = new RefillingTokenBucket<string>('webauthn-challenge-ip', 30, 10);
const purposes = new Set<WebAuthnChallengePurpose>([
	'passkey-login',
	'passkey-register',
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
		!purposes.has(body.purpose as WebAuthnChallengePurpose)
	) {
		return new Response('Invalid purpose', { status: 400 });
	}
	const purpose = body.purpose as WebAuthnChallengePurpose;

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
			purpose === 'passkey-register' &&
			((event.locals.user.registered2FA && !event.locals.session.twoFactorVerified) ||
				!isSessionRecentlyReauthenticated(event.locals.session))
		) {
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

	const challenge = createWebAuthnChallenge(userId, purpose);
	return json({ challenge: encodeBase64(challenge) }, { headers: { 'cache-control': 'no-store' } });
}
