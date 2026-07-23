import { describe, expect, test } from 'bun:test';
import { hashPassword, verifyPasswordHash, verifyPasswordStrength } from './password';

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
