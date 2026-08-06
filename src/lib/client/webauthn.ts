import {
	startAuthentication,
	startRegistration,
	type AuthenticationResponseJSON,
	type RegistrationResponseJSON
} from '@simplewebauthn/browser';
import { decodeBase64url, encodeBase64url } from '$lib/encoding';
import {
	fetchPasskeyAuthenticatorMetadata,
	formatAAGUID
} from '$lib/passkey-authenticator-metadata';
import type { WebAuthnChallengePurpose } from '$lib/types/webauthn';

export async function createWebAuthnChallenge(purpose: WebAuthnChallengePurpose): Promise<string> {
	const response = await fetch('/api/webauthn/challenge', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ purpose })
	});
	if (!response.ok) {
		throw new Error('Failed to create WebAuthn challenge');
	}
	const data = (await response.json()) as unknown;
	if (
		typeof data !== 'object' ||
		data === null ||
		!('challenge' in data) ||
		typeof data.challenge !== 'string'
	) {
		throw new Error('Invalid WebAuthn challenge response');
	}
	return data.challenge;
}

export async function createWebAuthnAssertion(
	purpose: 'passkey-login' | 'passkey-2fa' | 'password-reset-2fa' | 'settings-reauth'
): Promise<WebAuthnAssertion> {
	verifyWebAuthnSupport();

	return startAuthentication({
		optionsJSON: {
			challenge: await createWebAuthnChallenge(purpose),
			userVerification: 'required',
			timeout: 60_000
		}
	});
}

export async function createWebAuthnRegistration(options: {
	rpName: string;
	userId: Uint8Array;
	username: string;
	excludedCredentialIds: Uint8Array[];
}): Promise<WebAuthnRegistration> {
	verifyWebAuthnSupport();

	const credential = await startRegistration({
		optionsJSON: {
			challenge: await createWebAuthnChallenge('passkey-register'),
			rp: { name: options.rpName },
			user: {
				id: encodeBase64url(options.userId),
				name: options.username,
				displayName: options.username
			},
			pubKeyCredParams: [
				{ type: 'public-key', alg: -7 },
				{ type: 'public-key', alg: -257 }
			],
			authenticatorSelection: {
				residentKey: 'required',
				userVerification: 'required'
			},
			excludeCredentials: options.excludedCredentialIds.map((id) => ({
				type: 'public-key',
				id: encodeBase64url(id)
			})),
			attestation: 'none',
			timeout: 60_000
		}
	});

	let suggestedName = '';
	try {
		const authenticatorData = decodeBase64url(credential.response.authenticatorData ?? '');
		if (authenticatorData.byteLength >= 53 && (authenticatorData[32]! & 0x40) !== 0) {
			const aaguid = formatAAGUID(authenticatorData.slice(37, 53));
			suggestedName = (await fetchPasskeyAuthenticatorMetadata())[aaguid]?.name ?? '';
		}
	} catch {
		// Metadata is optional; a passkey can still be named manually.
	}

	return {
		credential,
		suggested_name: suggestedName
	};
}

function verifyWebAuthnSupport(): void {
	if (
		typeof window === 'undefined' ||
		!window.isSecureContext ||
		!('PublicKeyCredential' in window) ||
		!navigator.credentials
	) {
		throw new Error('Passkeys are not supported by this browser or connection');
	}
}

export type WebAuthnAssertion = AuthenticationResponseJSON;

export interface WebAuthnRegistration {
	credential: RegistrationResponseJSON;
	suggested_name: string;
}
