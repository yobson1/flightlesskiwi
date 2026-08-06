import { error as logError } from '$lib/logger';
import { MAX_PASSKEY_NAME_LENGTH } from '$lib/auth-constants';
import { encodeBase64 } from '$lib/encoding';
import { rotateSessionAfter2FAEnrollment } from '$lib/server/auth';
import { authError, authSuccess, requireVerifiedSession } from '$lib/server/auth/api';
import { hashSecret } from '$lib/server/auth/utils';
import { createPasskeyCredential, getUserPasskeyCredentials } from '$lib/server/auth/webauthn';
import {
	verifyWebAuthnRegistration,
	WebAuthnVerificationError
} from '$lib/server/auth/webauthn-verify';
import type { RequestEvent } from './$types';

const MAX_PASSKEYS = 10;

export function POST(event: RequestEvent) {
	const guarded = requireVerifiedSession(event, { recentlyReauthenticated: true });
	if (guarded.response) return guarded.response;
	const { user } = guarded.authenticated;
	const credentials = getUserPasskeyCredentials(user.id);
	if (credentials.length >= MAX_PASSKEYS) return authError(400, 'Too many passkeys');

	return authSuccess('passkey-register', {
		username: user.username,
		credentialUserId: encodeBase64(hashSecret(user.id)),
		excludedCredentialIds: credentials.map((credential) => encodeBase64(credential.id))
	});
}

export async function PUT(event: RequestEvent) {
	const guarded = requireVerifiedSession(event, { recentlyReauthenticated: true });
	if (guarded.response) return guarded.response;
	const { session, user } = guarded.authenticated;
	const formData = await event.request.formData();
	const name = formData.get('name');
	const encodedCredential = formData.get('credential');
	if (
		typeof name !== 'string' ||
		name.trim().length === 0 ||
		name.length > MAX_PASSKEY_NAME_LENGTH ||
		typeof encodedCredential !== 'string'
	) {
		return authError(400, 'Invalid or missing fields');
	}
	if (getUserPasskeyCredentials(user.id).length >= MAX_PASSKEYS) {
		return authError(400, 'Too many passkeys');
	}

	let credential: unknown;
	try {
		credential = JSON.parse(encodedCredential) as unknown;
	} catch {
		return authError(400, 'Invalid passkey registration');
	}
	try {
		const verified = await verifyWebAuthnRegistration(credential, user.id, 'passkey-register');
		createPasskeyCredential({ ...verified, userId: user.id, name: name.trim() });
	} catch (cause) {
		if (cause instanceof WebAuthnVerificationError || String(cause).includes('UNIQUE')) {
			return authError(400, 'Invalid passkey registration');
		}
		logError('Unexpected passkey registration failure', cause);
		return authError(500, 'Unable to register passkey');
	}
	if (!user.registered2FA) rotateSessionAfter2FAEnrollment(event, session);
	return authSuccess(user.registeredTOTP ? null : 'setup');
}
