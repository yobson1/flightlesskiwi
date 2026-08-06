import { describe, expect, test } from 'bun:test';
import { createTOTPKeyURI, verifyTOTPKey } from './totp-code';

const rfc6238Sha1Secret = new TextEncoder().encode('12345678901234567890');

describe('TOTP', () => {
	test('verifies the RFC 6238 SHA-1 value using the configured six digits', () => {
		expect(verifyTOTPKey(rfc6238Sha1Secret, '287082', 59_000)).toBe(1);
		expect(verifyTOTPKey(rfc6238Sha1Secret, '287081', 59_000)).toBeNull();
	});

	test('creates a compatible authenticator key URI', () => {
		const uri = new URL(
			createTOTPKeyURI('Flightless Kiwi', 'person@example.com', rfc6238Sha1Secret)
		);

		expect(uri.protocol).toBe('otpauth:');
		expect(uri.hostname).toBe('totp');
		expect(decodeURIComponent(uri.pathname)).toBe('/Flightless Kiwi:person@example.com');
		expect(uri.searchParams.get('issuer')).toBe('Flightless Kiwi');
		expect(uri.searchParams.get('algorithm')).toBe('SHA1');
		expect(uri.searchParams.get('digits')).toBe('6');
		expect(uri.searchParams.get('period')).toBe('30');
	});
});
