import { error as logError } from '$lib/logger';
import { setSessionAs2FAVerified } from '$lib/server/auth';
import { parseAssertionRequest } from '$lib/server/auth/routes';
import { getUserPasskeyCredential } from '$lib/server/auth/webauthn';
import {
	verifyWebAuthnAssertion,
	WebAuthnVerificationError
} from '$lib/server/auth/webauthn-verify';
import type { RequestEvent } from './$types';

export async function POST(event: RequestEvent) {
	if (event.locals.session === null || event.locals.user === null) {
		return new Response('Not authenticated', { status: 401 });
	}
	if (
		!event.locals.user.emailVerified ||
		!event.locals.user.registeredPasskey ||
		event.locals.session.twoFactorVerified
	) {
		return new Response('Forbidden', { status: 403 });
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
			'passkey-2fa'
		);
	} catch (cause) {
		if (cause instanceof WebAuthnVerificationError) {
			return new Response('Invalid passkey assertion', { status: 400 });
		}
		logError('Unexpected passkey 2FA failure', cause);
		return new Response('Internal error', { status: 500 });
	}
	setSessionAs2FAVerified(event.locals.session.id);
	return new Response(null, { status: 204 });
}
