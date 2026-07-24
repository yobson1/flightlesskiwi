import { error as logError } from '$lib/logger';
import { rotateSessionAfterReauthentication } from '$lib/server/auth';
import { authError, authSuccess, requireVerifiedSession } from '$lib/server/auth/api';
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
	const guarded = requireVerifiedSession(event);
	if (guarded.response) return guarded.response;
	const { session, user } = guarded.authenticated;
	if (!user.registeredPasskey) return authError(403, 'Passkey reauthentication is not available');
	if (!assertionBucket.consume(session.id, 1)) return authError(429, 'Too many requests');
	const assertion = await parseAssertionRequest(event.request);
	if (assertion === null) return authError(400, 'Invalid or missing fields');
	const credential = getUserPasskeyCredential(user.id, assertion.credentialId);
	if (credential === null) return authError(400, 'Invalid credential');
	try {
		verifyWebAuthnAssertion(
			assertion.authenticatorData,
			assertion.clientDataJSON,
			assertion.signature,
			credential,
			user.id,
			'settings-reauth'
		);
	} catch (cause) {
		if (cause instanceof WebAuthnVerificationError) {
			return authError(400, 'Invalid passkey assertion');
		}
		logError('Unexpected passkey reauthentication failure', cause);
		return authError(500, 'Unable to confirm your identity');
	}
	assertionBucket.reset(session.id);
	rotateSessionAfterReauthentication(event, session);
	return authSuccess(null);
}
