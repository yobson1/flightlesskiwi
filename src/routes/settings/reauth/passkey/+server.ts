import { error as logError } from '$lib/logger';
import { rotateSessionAfterReauthentication } from '$lib/server/auth';
import { ExpiringTokenBucket } from '$lib/server/auth/rate-limit';
import { parseAssertionRequest } from '$lib/server/auth/routes';
import { getUserPasskeyCredential } from '$lib/server/auth/webauthn';
import {
	verifyWebAuthnAssertion,
	WebAuthnVerificationError
} from '$lib/server/auth/webauthn-verify';
import type { RequestEvent } from './$types';

const assertionBucket = new ExpiringTokenBucket<string>('settings-passkey-reauth', 5, 15 * 60);

export async function POST(event: RequestEvent) {
	if (event.locals.session === null || event.locals.user === null) {
		return new Response('Not authenticated', { status: 401 });
	}
	if (
		!event.locals.user.emailVerified ||
		!event.locals.session.twoFactorVerified ||
		!event.locals.user.registeredPasskey
	) {
		return new Response('Forbidden', { status: 403 });
	}
	if (!assertionBucket.consume(event.locals.session.id, 1)) {
		return new Response('Too many requests', { status: 429 });
	}
	const assertion = await parseAssertionRequest(event.request);
	if (assertion === null) {
		return new Response('Invalid or missing fields', { status: 400 });
	}
	const credential = getUserPasskeyCredential(event.locals.user.id, assertion.credentialId);
	if (credential === null) {
		return new Response('Invalid credential', { status: 400 });
	}
	try {
		verifyWebAuthnAssertion(
			assertion.authenticatorData,
			assertion.clientDataJSON,
			assertion.signature,
			credential,
			event.locals.user.id,
			'settings-reauth'
		);
	} catch (cause) {
		if (cause instanceof WebAuthnVerificationError) {
			return new Response('Invalid passkey assertion', { status: 400 });
		}
		logError('Unexpected settings passkey reauthentication failure', cause);
		return new Response('Internal error', { status: 500 });
	}
	assertionBucket.reset(event.locals.session.id);
	rotateSessionAfterReauthentication(event, event.locals.session);
	return new Response(null, { status: 204 });
}
