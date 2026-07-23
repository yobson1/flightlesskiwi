import {
	encodeBase32LowerCaseNoPadding,
	encodeBase32UpperCaseNoPadding,
	encodeHexLowerCase
} from '@oslojs/encoding';

export function generateSecureRandomString(): string {
	const bytes = new Uint8Array(24);
	crypto.getRandomValues(bytes);
	return encodeBase32LowerCaseNoPadding(bytes);
}

export function generateRandomOTP(): string {
	const bytes = new Uint8Array(5);
	crypto.getRandomValues(bytes);
	return encodeBase32UpperCaseNoPadding(bytes);
}

export function generateRandomRecoveryCode(): string {
	const bytes = new Uint8Array(10);
	crypto.getRandomValues(bytes);
	return encodeBase32UpperCaseNoPadding(bytes);
}

export function hashSecret(secret: string | Uint8Array): Buffer {
	return Bun.CryptoHasher.hash('sha256', secret);
}

export function encodeHashedSecret(secret: string | Uint8Array): string {
	return encodeHexLowerCase(hashSecret(secret));
}

export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.byteLength !== b.byteLength) {
		return false;
	}
	let difference = 0;
	for (let index = 0; index < a.byteLength; index++) {
		difference |= a[index]! ^ b[index]!;
	}
	return difference === 0;
}
