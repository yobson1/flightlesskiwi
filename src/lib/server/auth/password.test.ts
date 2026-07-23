import { describe, expect, test } from 'bun:test';
import {
	hashPassword,
	hashRecoveryCode,
	verifyPasswordHash,
	verifyPasswordStrength,
	verifyRecoveryCodeHash
} from './password';

describe('password hashing', () => {
	test('uses Argon2id and verifies only the original password', async () => {
		const password = 'a secure test password';
		const passwordHash = await hashPassword(password);

		expect(passwordHash.startsWith('$argon2id$')).toBe(true);
		expect(await verifyPasswordHash(passwordHash, password)).toBe(true);
		expect(await verifyPasswordHash(passwordHash, 'not the password')).toBe(false);
	});

	test('accepts long passphrases and rejects short or oversized passwords', () => {
		expect(verifyPasswordStrength('correct horse battery staple')).toBe(true);
		expect(verifyPasswordStrength('too-short')).toBe(false);
		expect(verifyPasswordStrength('a'.repeat(256))).toBe(false);
	});
});

describe('recovery code hashing', () => {
	test('uses a one-way Argon2id hash and normalizes human input', async () => {
		const recoveryCode = 'ABCDEFGH23456789';
		const hash = await hashRecoveryCode(recoveryCode);

		expect(hash).toStartWith('$argon2id$');
		expect(hash).not.toContain(recoveryCode);
		expect(await verifyRecoveryCodeHash(hash, `  ${recoveryCode.toLowerCase()}  `)).toBe(true);
		expect(await verifyRecoveryCodeHash(hash, 'WRONGCODE2345678')).toBe(false);
	});
});
