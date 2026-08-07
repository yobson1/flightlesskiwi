import { WEBAUTHN_RP_ID, WEBAUTHN_RP_NAME } from '$app/env/private';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { error as logError } from '$lib/logger';
import { MAX_PASSKEY_NAME_LENGTH } from '$lib/auth-constants';
import { encodeBase64url } from '$lib/encoding';
import { rotateSessionFor2FAEnrollment } from '$lib/server/auth';
import { authError, authSuccess, requireVerifiedSession } from '$lib/server/auth/api';
import { hashSecret } from '$lib/server/auth/utils';
import {
	createPasskeyCredential,
	getUserPasskeyCredentials,
	storeWebAuthnChallenge,
	WEBAUTHN_SUPPORTED_ALGORITHM_IDS
} from '$lib/server/auth/webauthn';
import {
	verifyWebAuthnRegistration,
	WebAuthnVerificationError
} from '$lib/server/auth/webauthn-verify';
import type { RequestEvent } from './$types';

const MAX_PASSKEYS = 10;

export async function POST(event: RequestEvent) {
	const guarded = requireVerifiedSession(event, { recentlyReauthenticated: true });
	if (guarded.response) return guarded.response;
	const { user } = guarded.authenticated;
	const credentials = getUserPasskeyCredentials(user.id);
	if (credentials.length >= MAX_PASSKEYS) return authError(400, 'Too many passkeys');

	const options = await generateRegistrationOptions({
		rpName: WEBAUTHN_RP_NAME!,
		rpID: WEBAUTHN_RP_ID!,
		userName: user.username,
		userID: Uint8Array.from(hashSecret(user.id)),
		attestationType: 'none',
		excludeCredentials: credentials.map((credential) => ({
			id: encodeBase64url(credential.id)
		})),
		authenticatorSelection: {
			residentKey: 'required',
			userVerification: 'required'
		},
		supportedAlgorithmIDs: [...WEBAUTHN_SUPPORTED_ALGORITHM_IDS]
	});
	storeWebAuthnChallenge(options.challenge, user.id, 'passkey-register');
	return authSuccess('passkey-register', { options });
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
		if (!user.registered2FA) rotateSessionFor2FAEnrollment(event, session);
		createPasskeyCredential({ ...verified, userId: user.id, name: name.trim() });
	} catch (cause) {
		if (cause instanceof WebAuthnVerificationError || String(cause).includes('UNIQUE')) {
			return authError(400, 'Invalid passkey registration');
		}
		logError('Unexpected passkey registration failure', cause);
		return authError(500, 'Unable to register passkey');
	}
	return authSuccess(user.registeredTOTP ? null : 'setup');
}
