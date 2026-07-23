import {
	encodeBase32LowerCaseNoPadding,
	encodeBase32UpperCaseNoPadding,
	encodeHexLowerCase
} from '@oslojs/encoding';
import { sha256 } from '@oslojs/crypto/sha2';
import { timingSafeEqual } from 'node:crypto';

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
	const bytes = typeof secret === 'string' ? new TextEncoder().encode(secret) : secret;
	return Buffer.from(sha256(bytes));
}

export function encodeHashedSecret(secret: string | Uint8Array): string {
	return encodeHexLowerCase(hashSecret(secret));
}

export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
	return a.byteLength === b.byteLength && timingSafeEqual(a, b);
}
