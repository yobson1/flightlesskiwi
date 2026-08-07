import { afterAll, afterEach, describe, expect, mock, setSystemTime, test } from 'bun:test';
import type { RequestEvent } from '@sveltejs/kit';
import { createTestDatabase } from '$lib/server/test-db';

const testDatabase = await createTestDatabase();

mock.module('$lib/server/db', () => ({ db: testDatabase.db }));
mock.module('$lib/server/auth/api', () => ({
	authError: (status: number, message: string) => Response.json({ message }, { status }),
	authSuccess: (next: string | null, data: object = {}) => Response.json({ ...data, next }),
	getClientIP: (event: RequestEvent) => event.getClientAddress()
}));
mock.module('$lib/server/auth/2fa', () => ({
	isRecoveryCode: () => false,
	verifyUserRecoveryCode: async () => 'invalid'
}));
mock.module('$lib/server/auth/login-attempt', () => ({
	consumeLoginAttemptRequest: () => false,
	invalidateLoginAttemptRequest: () => {},
	validateLoginAttemptRequest: () => ({ attempt: null, user: null })
}));
mock.module('$lib/server/auth/login', () => ({
	completeLogin: () => null,
	completeLoginFirstFactor: () => null
}));
mock.module('$lib/server/auth/password', () => ({
	hashPassword: async () => 'dummy-hash',
	isPasswordInput: (value: unknown) => typeof value === 'string' && value.length > 0,
	verifyPasswordHash: async () => false
}));
mock.module('$lib/server/auth/totp', () => ({
	isTOTPCode: () => false,
	verifyUserTOTP: () => 'invalid'
}));
mock.module('$lib/server/auth/user', () => ({
	getUserById: () => null,
	getUserFromEmail: () => null,
	getUserPasswordHash: () => null,
	normalizeEmail: (email: string) => email.trim().toLowerCase(),
	verifyEmailInput: (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}));

const { POST } = await import('./+server');

afterEach(() => {
	setSystemTime();
});

afterAll(() => {
	testDatabase.close();
});

describe('password login rate limits', () => {
	test('shares failed attempts across IPs and gradually restores access', async () => {
		const start = new Date('2026-01-01T00:00:00.000Z');
		const email = `${crypto.randomUUID()}@example.com`;
		setSystemTime(start);

		for (let attempt = 1; attempt <= 5; attempt++) {
			expect((await login(email, `192.0.2.${attempt}`)).status).toBe(400);
		}

		expect((await login(email, '198.51.100.1')).status).toBe(429);
		expect((await login(`${crypto.randomUUID()}@example.com`, '198.51.100.1')).status).toBe(400);

		setSystemTime(new Date(start.getTime() + 3 * 60 * 1000));
		expect((await login(email, '203.0.113.1')).status).toBe(400);
	});
});

function login(email: string, clientIP: string): Promise<Response> {
	return POST({
		locals: { session: null },
		request: new Request('https://example.com/api/auth/login', {
			method: 'POST',
			body: new URLSearchParams({ email, password: 'incorrect-password' })
		}),
		getClientAddress: () => clientIP
	} as Parameters<typeof POST>[0]);
}
