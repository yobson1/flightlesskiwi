import { error as logError } from '$lib/logger';
import { authError, authSuccess } from '$lib/server/auth/api';
import {
	setPasswordResetSessionAs2FAVerified,
	validatePasswordResetSessionRequest
} from '$lib/server/auth/password-reset';
import { parseAssertionRequest } from '$lib/server/auth/routes';
import { getUserPasskeyCredential } from '$lib/server/auth/webauthn';
import {
	verifyWebAuthnAssertion,
	WebAuthnVerificationError
} from '$lib/server/auth/webauthn-verify';
import type { RequestEvent } from './$types';

export async function POST(event: RequestEvent) {
	if (event.locals.session !== null) {
		return authError(409, 'You are already signed in');
	}
	const { session, user } = validatePasswordResetSessionRequest(event);
	if (
		session === null ||
		!session.emailVerified ||
		session.twoFactorVerified ||
		!user.registeredPasskey
	) {
		return authError(403, 'Passkey verification is not available');
	}
	const assertion = await parseAssertionRequest(event.request);
	if (assertion === null) {
		return authError(400, 'Invalid or missing passkey response');
	}
	const credential = getUserPasskeyCredential(user.id, assertion.credentialId);
	if (credential === null) {
		return authError(400, 'Invalid credential');
	}
	try {
		verifyWebAuthnAssertion(
			assertion.authenticatorData,
			assertion.clientDataJSON,
			assertion.signature,
			credential,
			user.id,
			'password-reset-2fa'
		);
	} catch (cause) {
		if (cause instanceof WebAuthnVerificationError) {
			return authError(400, 'Invalid passkey assertion');
		}
		logError('Unexpected password-reset passkey failure', cause);
		return authError(500, 'Unable to verify passkey');
	}
	setPasswordResetSessionAs2FAVerified(session.id);
	return authSuccess('password-reset', {
		stage: 'password',
		email: session.email,
		registeredTOTP: false,
		registeredPasskey: false
	});
}
