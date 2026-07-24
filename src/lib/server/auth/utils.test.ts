import { describe, expect, test } from 'bun:test';
import {
	EMAIL_CODE_LENGTH,
	EMAIL_CODE_LENGTH_WORD,
	RECOVERY_CODE_LENGTH,
	TOTP_CODE_LENGTH_WORD
} from '$lib/auth-constants';
import {
	constantTimeEqual,
	generateRandomOTP,
	generateRandomRecoveryCode,
	generateSecureRandomString,
	hashSecret
} from './utils';

describe('auth secrets', () => {
	test('generates distinct high-entropy session components', () => {
		const first = generateSecureRandomString();
		const second = generateSecureRandomString();

		expect(first).not.toBe(second);
		expect(first.length).toBeGreaterThanOrEqual(38);
	});

	test('generates fixed-length human-readable codes', () => {
		const emailCode = generateRandomOTP();
		const recoveryCode = generateRandomRecoveryCode();

		expect(emailCode).toHaveLength(EMAIL_CODE_LENGTH);
		expect(emailCode).toMatch(/^[A-Z2-7]+$/);
		expect(recoveryCode).toHaveLength(RECOVERY_CODE_LENGTH);
		expect(recoveryCode).toMatch(/^[A-Z2-7]+$/);
		expect(EMAIL_CODE_LENGTH_WORD).toBe('eight');
		expect(TOTP_CODE_LENGTH_WORD).toBe('six');
	});

	test('compares hashes without accepting unequal inputs', () => {
		const first = hashSecret('secret');
		const same = hashSecret('secret');
		const other = hashSecret('different');

		expect(constantTimeEqual(first, same)).toBe(true);
		expect(constantTimeEqual(first, other)).toBe(false);
		expect(constantTimeEqual(first, new Uint8Array(1))).toBe(false);
	});
});
