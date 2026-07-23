import { decodeBase64, encodeBase64 } from '@oslojs/encoding';
import type { WebAuthnChallengePurpose } from '$lib/types/webauthn';

export async function createWebAuthnChallenge(
	purpose: WebAuthnChallengePurpose
): Promise<Uint8Array> {
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
	return decodeBase64(data.challenge);
}

export async function createWebAuthnAssertion(
	purpose: 'passkey-login' | 'passkey-2fa'
): Promise<WebAuthnAssertion> {
	verifyWebAuthnSupport();

	const challenge = await createWebAuthnChallenge(purpose);
	const challengeBuffer = new ArrayBuffer(challenge.byteLength);
	new Uint8Array(challengeBuffer).set(challenge);
	const credential = await navigator.credentials.get({
		publicKey: {
			challenge: challengeBuffer,
			userVerification: 'required',
			timeout: 60_000
		}
	});
	if (!(credential instanceof PublicKeyCredential)) {
		throw new Error('No passkey was selected');
	}
	const response = credential.response;
	if (!(response instanceof AuthenticatorAssertionResponse)) {
		throw new Error('The authenticator returned an invalid response');
	}

	return {
		authenticator_data: encodeBase64(new Uint8Array(response.authenticatorData)),
		client_data_json: encodeBase64(new Uint8Array(response.clientDataJSON)),
		credential_id: encodeBase64(new Uint8Array(credential.rawId)),
		signature: encodeBase64(new Uint8Array(response.signature))
	};
}

export async function createWebAuthnRegistration(options: {
	rpName: string;
	userId: Uint8Array;
	username: string;
	excludedCredentialIds: Uint8Array[];
}): Promise<WebAuthnRegistration> {
	verifyWebAuthnSupport();

	const challenge = await createWebAuthnChallenge('passkey-register');
	const challengeBuffer = copyToArrayBuffer(challenge);
	const userId = copyToArrayBuffer(options.userId);
	const credential = await navigator.credentials.create({
		publicKey: {
			challenge: challengeBuffer,
			rp: { name: options.rpName },
			user: {
				id: userId,
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
				id: copyToArrayBuffer(id)
			})),
			attestation: 'none',
			timeout: 60_000
		}
	});
	if (!(credential instanceof PublicKeyCredential)) {
		throw new Error('No passkey was created');
	}
	const response = credential.response;
	if (!(response instanceof AuthenticatorAttestationResponse)) {
		throw new Error('The authenticator returned an invalid response');
	}

	return {
		attestation_object: encodeBase64(new Uint8Array(response.attestationObject)),
		client_data_json: encodeBase64(new Uint8Array(response.clientDataJSON)),
		suggested_name: getSuggestedPasskeyName(response)
	};
}

function getSuggestedPasskeyName(response: AuthenticatorAttestationResponse): string {
	const transports = response.getTransports?.() ?? [];
	if (transports.includes('hybrid')) return 'Phone or tablet';
	if (transports.includes('usb') || transports.includes('nfc')) return 'Security key';
	if (transports.includes('internal')) return 'This device';
	return 'My passkey';
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

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	const buffer = new ArrayBuffer(bytes.byteLength);
	new Uint8Array(buffer).set(bytes);
	return buffer;
}

export interface WebAuthnAssertion {
	authenticator_data: string;
	client_data_json: string;
	credential_id: string;
	signature: string;
}

export interface WebAuthnRegistration {
	attestation_object: string;
	client_data_json: string;
	suggested_name: string;
}
