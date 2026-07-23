import { describe, expect, test } from 'bun:test';
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
		expect(generateRandomOTP()).toMatch(/^[A-Z2-7]{8}$/);
		expect(generateRandomRecoveryCode()).toMatch(/^[A-Z2-7]{16}$/);
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
