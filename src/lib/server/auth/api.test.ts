import { describe, expect, mock, test } from 'bun:test';
import type { RequestEvent } from '@sveltejs/kit';
import { TEST_PRIVATE_ENV } from '$lib/server/test-env';

mock.module('$app/env/private', () => TEST_PRIVATE_ENV);

const { getClientIP } = await import('./client-ip');

function createEvent(directAddress: string | Error, forwardedAddress?: string): RequestEvent {
	const headers = new Headers();
	if (forwardedAddress !== undefined) headers.set('X-Real-IP', forwardedAddress);

	return {
		request: new Request('http://localhost', { headers }),
		getClientAddress: () => {
			if (directAddress instanceof Error) throw directAddress;
			return directAddress;
		}
	} as RequestEvent;
}

describe('client IP detection', () => {
	test('uses the configured header when the request comes from the trusted proxy', () => {
		expect(getClientIP(createEvent('127.0.0.1', ' 203.0.113.10 '))).toBe('203.0.113.10');
	});

	test('ignores the configured header when the direct client is not the trusted proxy', () => {
		expect(getClientIP(createEvent('198.51.100.20', '203.0.113.10'))).toBe('198.51.100.20');
	});

	test('falls back to the proxy address when its client IP header is absent or blank', () => {
		expect(getClientIP(createEvent('127.0.0.1'))).toBe('127.0.0.1');
		expect(getClientIP(createEvent('127.0.0.1', '   '))).toBe('127.0.0.1');
	});

	test('returns unknown when the direct client address is unavailable', () => {
		expect(getClientIP(createEvent(new Error('unavailable'), '203.0.113.10'))).toBe('unknown');
	});
});
