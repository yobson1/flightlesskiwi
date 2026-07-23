import { decodeBase64 } from '@oslojs/encoding';
import { fail, redirect } from '@sveltejs/kit';
import { error as logError } from '$lib/logger';
import {
	isSessionRecentlyReauthenticated,
	rotateSessionAfter2FAEnrollment
} from '$lib/server/auth';
import { get2FARedirect } from '$lib/server/auth/2fa';
import { hashSecret } from '$lib/server/auth/utils';
import { createPasskeyCredential, getUserPasskeyCredentials } from '$lib/server/auth/webauthn';
import {
	verifyWebAuthnRegistration,
	WebAuthnVerificationError
} from '$lib/server/auth/webauthn-verify';
import type { Actions, RequestEvent } from './$types';

const MAX_PASSKEYS = 10;

export function load(event: RequestEvent) {
	if (event.locals.session === null || event.locals.user === null) {
		redirect(302, '/login');
	}
	if (!event.locals.user.emailVerified) {
		redirect(302, '/verify-email');
	}
	if (event.locals.user.registered2FA && !event.locals.session.twoFactorVerified) {
		redirect(302, get2FARedirect(event.locals.user));
	}
	if (!isSessionRecentlyReauthenticated(event.locals.session)) {
		redirect(302, '/settings?next=/2fa/passkey/register');
	}
	return {
		user: event.locals.user,
		credentials: getUserPasskeyCredentials(event.locals.user.id),
		credentialUserId: hashSecret(event.locals.user.id)
	};
}

export const actions: Actions = {
	default: registerPasskey
};

async function registerPasskey(event: RequestEvent) {
	if (event.locals.session === null || event.locals.user === null) {
		return fail(401, { message: 'Not authenticated' });
	}
	if (
		!event.locals.user.emailVerified ||
		(event.locals.user.registered2FA && !event.locals.session.twoFactorVerified)
	) {
		return fail(403, { message: 'Forbidden' });
	}
	if (!isSessionRecentlyReauthenticated(event.locals.session)) {
		return fail(428, { message: 'Confirm your identity before adding a passkey' });
	}
	const formData = await event.request.formData();
	const name = formData.get('name');
	const encodedAttestationObject = formData.get('attestation_object');
	const encodedClientDataJSON = formData.get('client_data_json');
	if (
		typeof name !== 'string' ||
		name.trim().length === 0 ||
		name.length > 64 ||
		typeof encodedAttestationObject !== 'string' ||
		typeof encodedClientDataJSON !== 'string'
	) {
		return fail(400, { message: 'Invalid or missing fields' });
	}
	if (getUserPasskeyCredentials(event.locals.user.id).length >= MAX_PASSKEYS) {
		return fail(400, { message: 'Too many passkeys' });
	}

	let attestationObject: Uint8Array;
	let clientDataJSON: Uint8Array;
	try {
		attestationObject = decodeBase64(encodedAttestationObject);
		clientDataJSON = decodeBase64(encodedClientDataJSON);
	} catch {
		return fail(400, { message: 'Invalid encoded data' });
	}
	try {
		const verified = verifyWebAuthnRegistration(
			attestationObject,
			clientDataJSON,
			event.locals.user.id,
			'passkey-register'
		);
		createPasskeyCredential({
			...verified,
			userId: event.locals.user.id,
			name: name.trim()
		});
	} catch (cause) {
		if (cause instanceof WebAuthnVerificationError || String(cause).includes('UNIQUE')) {
			return fail(400, { message: 'Invalid passkey registration' });
		}
		logError('Unexpected passkey registration failure', cause);
		return fail(500, { message: 'Unable to register passkey' });
	}
	if (!event.locals.user.registered2FA) {
		rotateSessionAfter2FAEnrollment(event, event.locals.session);
	}
	if (!event.locals.user.registeredTOTP) {
		redirect(302, '/2fa/setup');
	}
	redirect(302, '/');
}
