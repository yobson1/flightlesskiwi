import {
	startAuthentication,
	startRegistration,
	type AuthenticationResponseJSON,
	type PublicKeyCredentialCreationOptionsJSON,
	type PublicKeyCredentialRequestOptionsJSON,
	type RegistrationResponseJSON
} from '@simplewebauthn/browser';
import { decodeBase64url } from '$lib/encoding';
import {
	fetchPasskeyAuthenticatorMetadata,
	formatAAGUID
} from '$lib/passkey-authenticator-metadata';
import type { WebAuthnChallengePurpose } from '$lib/types/webauthn';
import { isRecord } from '$lib/utils';

async function getWebAuthnOptions(
	purpose: Exclude<WebAuthnChallengePurpose, 'passkey-register'>
): Promise<unknown> {
	const response = await fetch('/api/webauthn/options', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ purpose })
	});
	if (!response.ok) {
		throw new Error('Failed to create WebAuthn options');
	}
	return response.json() as Promise<unknown>;
}

export async function createWebAuthnAssertion(
	purpose: Exclude<WebAuthnChallengePurpose, 'passkey-register'>
): Promise<WebAuthnAssertion> {
	verifyWebAuthnSupport();
	const options = await getWebAuthnOptions(purpose);
	if (!isAuthenticationOptions(options)) {
		throw new Error('Invalid WebAuthn authentication options');
	}

	return startAuthentication({
		optionsJSON: options
	});
}

export async function createWebAuthnRegistration(
	options: PublicKeyCredentialCreationOptionsJSON
): Promise<WebAuthnRegistration> {
	verifyWebAuthnSupport();

	const credential = await startRegistration({
		optionsJSON: options
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

export function isWebAuthnCancellation(cause: unknown): cause is Error {
	return cause instanceof Error && cause.name === 'NotAllowedError';
}

function isAuthenticationOptions(value: unknown): value is PublicKeyCredentialRequestOptionsJSON {
	return (
		isRecord(value) &&
		typeof value.challenge === 'string' &&
		typeof value.rpId === 'string' &&
		(value.allowCredentials === undefined || Array.isArray(value.allowCredentials))
	);
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
