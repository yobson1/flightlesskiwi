import { afterEach, describe, expect, mock, setSystemTime, test } from 'bun:test';

mock.module('$env/static/private', () => ({ DATABASE_URL: 'local.db' }));

const { ExpiringMultiWindowTokenBucket } = await import('./rate-limit');

const start = new Date('2026-01-01T00:00:00.000Z');
const key = 'recipient@example.com';
const bucket = new ExpiringMultiWindowTokenBucket<string>(
	`code-email-test-${crypto.randomUUID()}`,
	[
		{ max: 1, expiresInSeconds: 30 },
		{ max: 5, expiresInSeconds: 10 * 60 }
	]
);

afterEach(() => {
	bucket.reset(key);
	setSystemTime();
});

describe('multi-window rate limits', () => {
	test('enforces both the cooldown and maximum sends per window', () => {
		setSystemTime(start);
		expect(bucket.consume(key, 1)).toBe(true);
		expect(bucket.consume(key, 1)).toBe(false);
		expect(bucket.retryAfterSeconds(key, 1)).toBe(30);

		for (const seconds of [30, 60, 90, 120]) {
			setSystemTime(new Date(start.getTime() + seconds * 1000));
			expect(bucket.consume(key, 1)).toBe(true);
		}

		expect(bucket.consume(key, 1)).toBe(false);
		expect(bucket.retryAfterSeconds(key, 1)).toBe(8 * 60);

		setSystemTime(new Date(start.getTime() + 10 * 60 * 1000));
		expect(bucket.consume(key, 1)).toBe(true);
	});
});
