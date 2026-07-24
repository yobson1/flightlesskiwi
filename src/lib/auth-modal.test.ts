import { describe, expect, test } from 'bun:test';
import {
	authModalDataEndpoint,
	authModalDataMethod,
	authModalHash,
	parseAuthModalHash
} from '$lib/auth-modal';
import { AUTH_MODAL_VIEWS } from '$lib/types/auth';

describe('auth modal fragments', () => {
	test('round-trips every supported view', () => {
		for (const view of AUTH_MODAL_VIEWS) {
			expect(parseAuthModalHash(authModalHash(view))).toBe(view);
		}
	});

	test('ignores unrelated or malformed fragments', () => {
		expect(parseAuthModalHash('')).toBeNull();
		expect(parseAuthModalHash('#benchmark-result')).toBeNull();
		expect(parseAuthModalHash('#%E0%A4%A')).toBeNull();
	});

	test('loads resumable password-reset state with GET', () => {
		expect(authModalDataEndpoint('password-reset')).toBe('/api/auth/password-reset');
		expect(authModalDataMethod('password-reset')).toBe('GET');
		expect(authModalDataMethod('totp-setup')).toBe('POST');
	});
});
