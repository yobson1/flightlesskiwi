import { WEBAUTHN_ORIGIN, WEBAUTHN_RP_ID } from '$app/env/private';
import {
	verifyAuthenticationResponse,
	verifyRegistrationResponse,
	type AuthenticationResponseJSON
} from '@simplewebauthn/server';
import { decodeClientDataJSON } from '@simplewebauthn/server/helpers';
import { decodeBase64url, encodeBase64url } from '#lib/encoding.js';
import {
	getPasskeyCredential,
	getUserPasskeyCredential,
	matchesWebAuthnChallenge,
	consumeWebAuthnChallenge,
	updatePasskeyCounter,
	WEBAUTHN_SUPPORTED_ALGORITHM_IDS,
	type WebAuthnUserCredential
} from '#lib/server/auth/webauthn.js';
import type { WebAuthnChallengePurpose } from '#lib/types/webauthn.js';
import { parseAuthenticationResponse, parseRegistrationResponse } from '#lib/webauthn-json.js';

export async function verifyWebAuthnAssertionRequest(
	request: Request,
	userId: string | null,
	purpose: Exclude<WebAuthnChallengePurpose, 'passkey-register'>
): Promise<WebAuthnUserCredential> {
	const assertion = await parseAssertionRequest(request);
	if (assertion === null) {
		throw new WebAuthnAssertionRequestError('Invalid or missing fields');
	}

	let credentialId: Uint8Array;
	try {
		credentialId = decodeBase64url(assertion.id);
	} catch {
		throw new WebAuthnAssertionRequestError('Invalid credential');
	}
	const credential =
		userId === null
			? getPasskeyCredential(credentialId)
			: getUserPasskeyCredential(userId, credentialId);
	if (credential === null) {
		throw new WebAuthnAssertionRequestError('Invalid credential');
	}

	try {
		await verifyWebAuthnAssertion(assertion, credential, userId, purpose);
	} catch (cause) {
		if (cause instanceof WebAuthnVerificationError) {
			throw new WebAuthnAssertionRequestError('Invalid passkey assertion');
		}
		throw cause;
	}
	return credential;
}

export async function verifyWebAuthnRegistration(
	value: unknown,
	userId: string,
	purpose: Extract<WebAuthnChallengePurpose, 'passkey-register'>
): Promise<Omit<WebAuthnUserCredential, 'userId' | 'name'>> {
	const response = parseRegistrationResponse(value);
	if (response === null) {
		throw new WebAuthnVerificationError('Invalid registration response');
	}

	let challenge: string | null = null;
	let verification;
	try {
		if (decodeClientDataJSON(response.response.clientDataJSON).crossOrigin === true) {
			throw new Error('Cross-origin registration is not allowed');
		}
		verification = await verifyRegistrationResponse({
			response,
			expectedChallenge: (encodedChallenge) => {
				challenge = encodedChallenge;
				return matchesWebAuthnChallenge(challenge, userId, purpose);
			},
			expectedOrigin: WEBAUTHN_ORIGIN!,
			expectedRPID: WEBAUTHN_RP_ID!,
			requireUserPresence: true,
			requireUserVerification: true,
			supportedAlgorithmIDs: [...WEBAUTHN_SUPPORTED_ALGORITHM_IDS]
		});
	} catch {
		throw new WebAuthnVerificationError('Invalid passkey registration');
	}
	if (!verification.verified || challenge === null) {
		throw new WebAuthnVerificationError('Invalid or expired challenge');
	}

	const { credential, aaguid, fmt } = verification.registrationInfo;
	if (fmt !== 'none') {
		throw new WebAuthnVerificationError('Unsupported attestation format');
	}
	if (!consumeWebAuthnChallenge(challenge, userId, purpose)) {
		throw new WebAuthnVerificationError('Invalid or expired challenge');
	}

	return {
		id: decodeBase64url(credential.id),
		aaguid,
		publicKey: credential.publicKey,
		signCount: credential.counter
	};
}

async function verifyWebAuthnAssertion(
	response: AuthenticationResponseJSON,
	credential: WebAuthnUserCredential,
	challengeUserId: string | null,
	purpose: Exclude<WebAuthnChallengePurpose, 'passkey-register'>
): Promise<void> {
	let challenge: string | null = null;
	let verification;
	try {
		if (decodeClientDataJSON(response.response.clientDataJSON).crossOrigin === true) {
			throw new Error('Cross-origin authentication is not allowed');
		}
		verification = await verifyAuthenticationResponse({
			response,
			expectedChallenge: (encodedChallenge) => {
				challenge = encodedChallenge;
				return matchesWebAuthnChallenge(challenge, challengeUserId, purpose);
			},
			expectedOrigin: WEBAUTHN_ORIGIN!,
			expectedRPID: WEBAUTHN_RP_ID!,
			credential: {
				id: encodeBase64url(credential.id),
				publicKey: Uint8Array.from(credential.publicKey),
				counter: credential.signCount
			},
			requireUserVerification: true
		});
	} catch {
		throw new WebAuthnVerificationError('Invalid passkey assertion');
	}
	if (
		!verification.verified ||
		challenge === null ||
		!consumeWebAuthnChallenge(challenge, challengeUserId, purpose)
	) {
		throw new WebAuthnVerificationError('Invalid passkey assertion');
	}
	if (
		!updatePasskeyCounter(
			credential.id,
			credential.signCount,
			verification.authenticationInfo.newCounter
		)
	) {
		throw new WebAuthnVerificationError('Authenticator counter did not increase');
	}
}

export class WebAuthnVerificationError extends Error {}

export class WebAuthnAssertionRequestError extends Error {}

async function parseAssertionRequest(request: Request): Promise<AuthenticationResponseJSON | null> {
	let data: unknown;
	try {
		data = await request.json();
	} catch {
		return null;
	}
	return parseAuthenticationResponse(data);
}
