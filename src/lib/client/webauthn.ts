import { decodeBase64 } from '@oslojs/encoding';
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
