import { error as logError } from '$lib/logger';
import { setSessionAs2FAVerified } from '$lib/server/auth';
import { authError, authSuccess, requireAuthenticated } from '$lib/server/auth/api';
import { parseAssertionRequest } from '$lib/server/auth/routes';
import { getUserPasskeyCredential } from '$lib/server/auth/webauthn';
import {
	verifyWebAuthnAssertion,
	WebAuthnVerificationError
} from '$lib/server/auth/webauthn-verify';
import type { RequestEvent } from './$types';

export async function POST(event: RequestEvent) {
	const guarded = requireAuthenticated(event);
	if (guarded.response) return guarded.response;
	const { session, user } = guarded.authenticated;
	if (!user.emailVerified) {
		return authError(403, 'Verify your email first', { modal: 'verify-email' });
	}
	if (!user.registeredPasskey || session.twoFactorVerified) {
		return authError(403, 'Passkey verification is not available');
	}
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
			'passkey-2fa'
		);
	} catch (cause) {
		if (cause instanceof WebAuthnVerificationError) {
			return authError(400, 'Invalid passkey assertion');
		}
		logError('Unexpected passkey 2FA failure', cause);
		return authError(500, 'Unable to verify passkey');
	}
	setSessionAs2FAVerified(session.id);
	return authSuccess(null);
}
