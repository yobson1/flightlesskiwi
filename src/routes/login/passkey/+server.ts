import { error as logError } from '$lib/logger';
import { createSession, generateSessionToken, setSessionTokenCookie } from '$lib/server/auth';
import { ExpiringTokenBucket } from '$lib/server/auth/rate-limit';
import { getClientIP, parseAssertionRequest } from '$lib/server/auth/routes';
import { getUserById } from '$lib/server/auth/user';
import { getPasskeyCredential } from '$lib/server/auth/webauthn';
import {
	verifyWebAuthnAssertion,
	WebAuthnVerificationError
} from '$lib/server/auth/webauthn-verify';
import type { RequestEvent } from './$types';

const assertionBucket = new ExpiringTokenBucket<string>('passkey-login-ip', 10, 10 * 60);

export async function POST(event: RequestEvent) {
	if (event.locals.session !== null) {
		return new Response('Already authenticated', { status: 409 });
	}
	if (!assertionBucket.consume(getClientIP(event), 1)) {
		return new Response('Too many requests', { status: 429 });
	}
	const assertion = await parseAssertionRequest(event.request);
	if (assertion === null) {
		return new Response('Invalid or missing fields', { status: 400 });
	}
	const credential = getPasskeyCredential(assertion.credentialId);
	if (credential === null) {
		return new Response('Invalid credential', { status: 400 });
	}
	try {
		verifyWebAuthnAssertion(
			assertion.authenticatorData,
			assertion.clientDataJSON,
			assertion.signature,
			credential,
			null,
			'passkey-login'
		);
	} catch (cause) {
		if (cause instanceof WebAuthnVerificationError) {
			return new Response('Invalid passkey assertion', { status: 400 });
		}
		logError('Unexpected passkey login failure', cause);
		return new Response('Internal error', { status: 500 });
	}
	const user = getUserById(credential.userId);
	if (user === null) {
		return new Response('Invalid credential', { status: 400 });
	}
	const token = generateSessionToken();
	const session = createSession(token, user.id, { twoFactorVerified: true });
	setSessionTokenCookie(event, token, session.expiresAt);
	return Response.json({
		redirect: user.emailVerified ? '/' : '/verify-email'
	});
}
