import { describe, expect, test } from 'bun:test';
import { isTurnstileProtectedAuthRequest } from './turnstile';

describe('Turnstile auth request selection', () => {
	test('protects submitted auth and reauthentication actions', () => {
		expect(isTurnstileProtectedAuthRequest('/api/auth/signup', 'POST')).toBe(true);
		expect(isTurnstileProtectedAuthRequest('/api/auth/login', 'PUT')).toBe(true);
		expect(isTurnstileProtectedAuthRequest('/api/auth/reauth', 'POST')).toBe(true);
		expect(isTurnstileProtectedAuthRequest('/api/auth/reauth/passkey', 'POST')).toBe(true);
	});

	test('does not protect reads, logout, or modal bootstrap requests', () => {
		expect(isTurnstileProtectedAuthRequest('/api/auth/password-reset', 'GET')).toBe(false);
		expect(isTurnstileProtectedAuthRequest('/api/auth/logout', 'POST')).toBe(false);
		expect(isTurnstileProtectedAuthRequest('/api/auth/totp-setup', 'POST')).toBe(false);
		expect(isTurnstileProtectedAuthRequest('/api/auth/totp-setup', 'PUT')).toBe(true);
		expect(isTurnstileProtectedAuthRequest('/api/game/1', 'POST')).toBe(false);
	});
});
