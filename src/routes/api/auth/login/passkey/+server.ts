import { error as logError } from '$lib/logger';
import { createSession, generateSessionToken, setSessionTokenCookie } from '$lib/server/auth';
import { authError, authSuccess } from '$lib/server/auth/api';
import { invalidateLoginAttemptRequest } from '$lib/server/auth/login-attempt';
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
		return authError(409, 'Already authenticated');
	}
	if (!assertionBucket.consume(getClientIP(event), 1)) {
		return authError(429, 'Too many requests');
	}
	const assertion = await parseAssertionRequest(event.request);
	if (assertion === null) {
		return authError(400, 'Invalid or missing fields');
	}
	const credential = getPasskeyCredential(assertion.credentialId);
	if (credential === null) {
		return authError(400, 'Invalid credential');
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
			return authError(400, 'Invalid passkey assertion');
		}
		logError('Unexpected passkey login failure', cause);
		return authError(500, 'Unable to sign in');
	}
	const user = getUserById(credential.userId);
	if (user === null) {
		return authError(400, 'Invalid credential');
	}
	invalidateLoginAttemptRequest(event);
	const token = generateSessionToken();
	const session = createSession(token, user.id, { twoFactorVerified: true });
	setSessionTokenCookie(event, token, session.expiresAt);
	return authSuccess(user.emailVerified ? null : 'verify-email');
}
