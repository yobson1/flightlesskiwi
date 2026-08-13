import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	setSystemTime,
	test
} from 'bun:test';
import type { RequestEvent } from '@sveltejs/kit';
import * as schema from '$lib/server/db/schema';
import type { AuthUser } from '$lib/server/auth/user';
import { createTestDatabase } from '$lib/server/test-db';
import type { AuthAPIResponse, AuthModalView } from '$lib/types/auth';

interface MockAuthErrorOptions {
	modal?: AuthModalView;
	reauthenticationRequired?: boolean;
	retryAfterSeconds?: number;
}

type MockAuthSuccessData = Omit<AuthAPIResponse, 'next'>;

const testDatabase = await createTestDatabase();
const testDb = testDatabase.db;

let currentUser: AuthUser | null = null;
let passwordValid = false;
let totpVerification: 'valid' | 'invalid' | 'rate-limited' = 'invalid';
let passkeyUserId: string | null = null;
let passkeyVerificationRequest: { userId: string | null; purpose: string } | null = null;
let clientIPCounter = 10;

mock.module('$app/env', () => ({ dev: true }));
mock.module('$lib/server/db', () => ({ db: testDb }));
mock.module('$lib/server/auth/api', () => ({
	authError: (status: number, message: string, options: MockAuthErrorOptions = {}) =>
		Response.json({ message, ...options }, { status }),
	authSuccess: (next: AuthModalView | null, data: MockAuthSuccessData = {}) =>
		Response.json({ ...data, next }),
	getClientIP: (event: RequestEvent) => event.getClientAddress(),
	verifyPasskeyRequest: async (_request: Request, userId: string | null, purpose: string) => {
		passkeyVerificationRequest = { userId, purpose };
		return passkeyUserId === null
			? { response: Response.json({ message: 'Invalid passkey' }, { status: 400 }) }
			: { credential: { userId: passkeyUserId } };
	}
}));
mock.module('$lib/server/auth/2fa', () => ({
	isRecoveryCode: () => false,
	verifyUserRecoveryCode: async () => 'invalid'
}));
mock.module('$lib/server/auth/password', () => ({
	hashPassword: async () => 'dummy-hash',
	isPasswordInput: (value: unknown) => typeof value === 'string' && value.length > 0,
	verifyPasswordHash: async () => passwordValid
}));
mock.module('$lib/server/auth/totp', () => ({
	isTOTPCode: (value: unknown) => typeof value === 'string' && /^\d{6}$/.test(value),
	verifyUserTOTP: () => totpVerification
}));
mock.module('$lib/server/auth/user', () => ({
	getUserById: (userId: string) => (currentUser?.id === userId ? currentUser : null),
	getUserFromEmail: (email: string) => (currentUser?.email === email ? currentUser : null),
	getUserPasswordHash: (userId: string) =>
		currentUser?.id === userId ? 'stored-password-hash' : null,
	normalizeEmail: (email: string) => email.trim().toLowerCase(),
	verifyEmailInput: (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}));

const { POST, PUT } = await import('./+server');
const { PUT: verifyPasskey } = await import('./passkey/+server');

beforeEach(() => {
	testDb.delete(schema.user).run();
	currentUser = null;
	passwordValid = false;
	totpVerification = 'invalid';
	passkeyUserId = null;
	passkeyVerificationRequest = null;
});

afterEach(() => {
	setSystemTime();
});

afterAll(() => {
	testDatabase.close();
});

describe('login route orchestration', () => {
	test('turns a valid password into a single-use TOTP login attempt and session', async () => {
		currentUser = insertUser({ registeredTOTP: true, registered2FA: true });
		passwordValid = true;
		totpVerification = 'valid';
		const cookies = createCookieJar();

		const firstFactor = await POST(
			createEvent('POST', { email: currentUser.email, password: 'correct-password' }, cookies)
		);

		expect(firstFactor.status).toBe(200);
		expect(await firstFactor.json()).toEqual({ next: 'login-2fa' });
		expect(cookies.get('login_attempt')).toBeString();
		expect(testDb.select().from(schema.loginAttempt).all()).toHaveLength(1);
		expect(testDb.select().from(schema.session).all()).toHaveLength(0);

		const secondFactor = await PUT(createEvent('PUT', { code: '123456' }, cookies));

		expect(secondFactor.status).toBe(200);
		expect(await secondFactor.json()).toEqual({ next: null });
		expect(cookies.get('login_attempt')).toBeUndefined();
		expect(cookies.get('session')).toBeString();
		expect(testDb.select().from(schema.loginAttempt).all()).toHaveLength(0);
		expect(testDb.select().from(schema.session).all()).toHaveLength(1);
	});

	test('binds passkey second-factor verification to the attempted user and consumes the attempt', async () => {
		currentUser = insertUser({ registeredPasskey: true, registered2FA: true });
		passwordValid = true;
		passkeyUserId = currentUser.id;
		const cookies = createCookieJar();
		await POST(
			createEvent('POST', { email: currentUser.email, password: 'correct-password' }, cookies)
		);

		const response = await verifyPasskey(
			createEvent('PUT', undefined, cookies) as unknown as Parameters<typeof verifyPasskey>[0]
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ next: 'setup' });
		expect(passkeyVerificationRequest).toEqual({
			userId: currentUser.id,
			purpose: 'passkey-2fa'
		});
		expect(testDb.select().from(schema.loginAttempt).all()).toHaveLength(0);
		expect(testDb.select().from(schema.session).all()).toHaveLength(1);
	});
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

function insertUser(overrides: Partial<AuthUser> = {}): AuthUser {
	const user: AuthUser = {
		id: crypto.randomUUID(),
		email: `${crypto.randomUUID()}@example.com`,
		username: 'Login User',
		emailVerified: true,
		hasPassword: true,
		registeredTOTP: false,
		registeredPasskey: false,
		registered2FA: false,
		recoveryCodeConfigured: false,
		oauthProviders: [],
		...overrides
	};
	testDb
		.insert(schema.user)
		.values({
			id: user.id,
			email: user.email,
			username: user.username,
			passwordHash: 'stored-password-hash',
			emailVerified: user.emailVerified,
			createdAt: new Date()
		})
		.run();
	return user;
}

function login(email: string, clientIP: string): Promise<Response> {
	return POST(
		createEvent('POST', { email, password: 'incorrect-password' }, createCookieJar(), clientIP)
	);
}

function createEvent(
	method: string,
	form: Record<string, string> | undefined,
	cookies: CookieJar,
	clientIP = `192.0.2.${clientIPCounter++}`
) {
	return {
		locals: { session: null, user: null },
		request: new Request('https://example.com/api/auth/login', {
			method,
			body: form === undefined ? undefined : new URLSearchParams(form)
		}),
		cookies,
		getClientAddress: () => clientIP
	} as unknown as Parameters<typeof POST>[0];
}

function createCookieJar() {
	const values = new Map<string, string>();
	return {
		get: (name: string) => values.get(name),
		set: (name: string, value: string) => values.set(name, value),
		delete: (name: string) => values.delete(name)
	};
}

type CookieJar = ReturnType<typeof createCookieJar>;
