import { building } from '$app/env';
import { AUTH_ENCRYPTION_KEY } from '$app/env/private';
import { decodeBase64 } from '@oslojs/encoding';
import { createCipheriv, createDecipheriv } from 'node:crypto';

const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const key = building ? undefined : decodeBase64(AUTH_ENCRYPTION_KEY!);

export function encrypt(data: Uint8Array): Buffer {
	const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
	const cipher = createCipheriv('aes-256-gcm', key!, iv);
	const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
	return Buffer.concat([iv, encrypted, cipher.getAuthTag()]);
}

export function encryptString(data: string): Buffer {
	return encrypt(new TextEncoder().encode(data));
}

export function decrypt(encrypted: Uint8Array): Uint8Array {
	if (encrypted.byteLength < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
		throw new Error('Invalid encrypted data');
	}
	const iv = encrypted.slice(0, IV_LENGTH);
	const tag = encrypted.slice(-AUTH_TAG_LENGTH);
	const ciphertext = encrypted.slice(IV_LENGTH, -AUTH_TAG_LENGTH);
	const decipher = createDecipheriv('aes-256-gcm', key!, iv);
	decipher.setAuthTag(tag);
	return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function decryptToString(data: Uint8Array): string {
	return new TextDecoder().decode(decrypt(data));
}

export function hashAuthCode(code: string): Buffer {
	const hasher = new Bun.CryptoHasher('sha256', key!);
	hasher.update(code);
	return hasher.digest();
}
