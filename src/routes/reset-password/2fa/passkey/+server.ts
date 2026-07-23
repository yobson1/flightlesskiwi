import { error as logError } from '$lib/logger';
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
	const { session, user } = validatePasswordResetSessionRequest(event);
	if (
		session === null ||
		!session.emailVerified ||
		!user.registeredPasskey ||
		session.twoFactorVerified
	) {
		return new Response('Forbidden', { status: 403 });
	}
	const assertion = await parseAssertionRequest(event.request);
	if (assertion === null) {
		return new Response('Invalid or missing fields', { status: 400 });
	}
	const credential = getUserPasskeyCredential(user.id, assertion.credentialId);
	if (credential === null) {
		return new Response('Invalid credential', { status: 400 });
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
			return new Response('Invalid passkey assertion', { status: 400 });
		}
		logError('Unexpected password-reset passkey failure', cause);
		return new Response('Internal error', { status: 500 });
	}
	setPasswordResetSessionAs2FAVerified(session.id);
	return new Response(null, { status: 204 });
}
