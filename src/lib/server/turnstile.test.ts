import { describe, expect, mock, test } from 'bun:test';
import { TURNSTILE_ACTION } from '$lib/turnstile';
import { TEST_PRIVATE_ENV } from './test-env';

mock.module('$app/env/private', () => ({
	...TEST_PRIVATE_ENV,
	TURNSTILE_SITE_KEY: 'site-key',
	TURNSTILE_SECRET: 'secret-key'
}));

const { verifyTurnstileToken } = await import('./turnstile');

function siteverifyResponse(result: unknown): typeof fetch {
	return (async () => Response.json(result)) as unknown as typeof fetch;
}

describe('Turnstile server validation', () => {
	test('accepts a successful response for the configured action and hostname', async () => {
		let request: Request | undefined;
		const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
			request = new Request(input, init);
			return Response.json({
				success: true,
				action: TURNSTILE_ACTION,
				hostname: 'app.example'
			});
		}) as typeof fetch;

		expect(await verifyTurnstileToken('valid-token', '192.0.2.1', fetcher)).toBe(true);
		expect(request?.url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
		expect(await request?.text()).toBe('secret=secret-key&response=valid-token&remoteip=192.0.2.1');
	});

	test('rejects responses for a different action or hostname', async () => {
		const invalidResponses = [
			{ success: true, action: 'different-action', hostname: 'app.example' },
			{ success: true, action: TURNSTILE_ACTION, hostname: 'example.com' },
			{ success: true, action: TURNSTILE_ACTION, hostname: 'attacker.example' },
			{ success: false, action: TURNSTILE_ACTION, hostname: 'app.example' }
		];

		for (const response of invalidResponses) {
			expect(
				await verifyTurnstileToken('invalid-token', '192.0.2.1', siteverifyResponse(response))
			).toBe(false);
		}
	});

	test('fails closed for missing tokens and unavailable or malformed verification responses', async () => {
		let requests = 0;
		const unavailable = (async () => {
			requests++;
			throw new Error('unavailable');
		}) as unknown as typeof fetch;

		expect(await verifyTurnstileToken(null, '192.0.2.1', unavailable)).toBe(false);
		expect(requests).toBe(0);
		expect(await verifyTurnstileToken('token', '192.0.2.1', unavailable)).toBe(false);
		expect(requests).toBe(1);
		expect(
			await verifyTurnstileToken(
				'token',
				'192.0.2.1',
				(async () => new Response('not json')) as unknown as typeof fetch
			)
		).toBe(false);
		expect(
			await verifyTurnstileToken(
				'token',
				'192.0.2.1',
				(async () => new Response(null, { status: 503 })) as unknown as typeof fetch
			)
		).toBe(false);
	});
});
