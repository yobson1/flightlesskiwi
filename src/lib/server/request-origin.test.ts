import { describe, expect, test } from 'bun:test';
import { isCrossOriginAPIRequest } from './request-origin';

const expectedOrigin = 'https://flightless.example';

describe('API request origin protection', () => {
	test('allows safe API requests without origin metadata', () => {
		for (const method of ['GET', 'HEAD', 'OPTIONS']) {
			expect(isRejected('/api/benchmarks', method)).toBeFalse();
		}
	});

	test('leaves non-API mutations to SvelteKit form-action protection', () => {
		expect(isRejected('/settings', 'POST', { origin: 'https://attacker.example' })).toBeFalse();
	});

	test('allows an unsafe API request with the configured origin', () => {
		expect(isRejected('/api/auth/logout', 'POST', { origin: expectedOrigin })).toBeFalse();
	});

	test('uses the referer when Origin is absent', () => {
		expect(
			isRejected('/api/auth/logout', 'POST', {
				referer: `${expectedOrigin}/settings?tab=security`
			})
		).toBeFalse();
	});

	test('rejects unsafe API requests without origin metadata', () => {
		expect(isRejected('/api/auth/logout', 'POST')).toBeTrue();
	});

	test('rejects cross-origin and malformed source headers', () => {
		for (const source of [
			'https://attacker.example',
			'https://account.flightless.example',
			'http://flightless.example',
			'https://flightless.example:444',
			'null',
			'not a URL'
		]) {
			expect(isRejected('/api/auth/logout', 'POST', { origin: source })).toBeTrue();
		}
	});

	test('does not trust Referer when an invalid Origin is present', () => {
		expect(
			isRejected('/api/auth/logout', 'POST', {
				origin: 'https://attacker.example',
				referer: `${expectedOrigin}/settings`
			})
		).toBeTrue();
	});
});

function isRejected(pathname: string, method: string, headers?: HeadersInit): boolean {
	const request = new Request(`${expectedOrigin}${pathname}`, { method, headers });
	return isCrossOriginAPIRequest(request, pathname, expectedOrigin);
}
