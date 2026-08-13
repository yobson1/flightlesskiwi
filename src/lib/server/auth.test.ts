import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { RequestEvent } from '@sveltejs/kit';
import * as schema from '$lib/server/db/schema';
import { createTestDatabase } from '$lib/server/test-db';

const testDatabase = await createTestDatabase();
const testDb = testDatabase.db;

mock.module('$app/env', () => ({ dev: true }));
mock.module('$lib/server/db', () => ({ db: testDb }));
mock.module('$lib/server/auth/encryption', () => ({
	encrypt: (value: Uint8Array) => Buffer.from(value),
	encryptString: (value: string) => Buffer.from(value),
	decrypt: (value: Uint8Array) => Buffer.from(value),
	decryptToString: (value: Uint8Array) => Buffer.from(value).toString(),
	hashAuthCode: (value: string) => Buffer.from(value)
}));

const { rotateSessionAfterReauthentication, rotateSessionFor2FAEnrollment, validateSessionToken } =
	await import('./auth');
const { hashSecret } = await import('./auth/utils');

beforeEach(() => {
	testDb.delete(schema.user).run();
	testDb
		.insert(schema.user)
		.values({
			id: 'two-factor-user',
			email: 'two-factor@example.com',
			username: 'Two Factor',
			passwordHash: 'password-hash',
			emailVerified: true,
			createdAt: new Date()
		})
		.run();
	testDb
		.insert(schema.totpCredential)
		.values({ userId: 'two-factor-user', encryptedKey: Buffer.alloc(20) })
		.run();
});

afterAll(() => {
	testDatabase.close();
});

describe('persistent sessions', () => {
	test('accepts a persistent session without separate 2FA state', () => {
		insertSession('session-id', 'session-secret');

		const result = validateSessionToken('session-id.session-secret');
		expect(result.session?.id).toBe('session-id');
		expect(result.user?.id).toBe('two-factor-user');
	});

	test('rotates after reauthentication without invalidating other sessions', () => {
		insertSession('current-session', 'current-secret');
		insertSession('other-session', 'other-secret');
		const currentSession = validateSessionToken('current-session.current-secret').session!;
		const cookie = createCookieEvent('current-session.current-secret');

		rotateSessionAfterReauthentication(cookie.event, currentSession);

		expect(testDb.select({ id: schema.session.id }).from(schema.session).all()).toEqual([
			{ id: 'current-session' },
			{ id: 'other-session' }
		]);
		expect(validateSessionToken('current-session.current-secret').session).toBeNull();
		expect(validateSessionToken(cookie.rotatedToken()).session?.id).toBe('current-session');
		expect(validateSessionToken('other-session.other-secret').session?.id).toBe('other-session');
	});

	test('rotates the enrolling session and invalidates every other session', () => {
		testDb.delete(schema.totpCredential).run();
		insertSession('current-session', 'current-secret');
		insertSession('other-session', 'other-secret');
		const currentSession = validateSessionToken('current-session.current-secret').session!;
		const cookie = createCookieEvent('current-session.current-secret');

		rotateSessionFor2FAEnrollment(cookie.event, currentSession);

		expect(testDb.select({ id: schema.session.id }).from(schema.session).all()).toEqual([
			{ id: 'current-session' }
		]);
		expect(validateSessionToken('current-session.current-secret').session).toBeNull();
		expect(validateSessionToken(cookie.rotatedToken()).session?.id).toBe('current-session');
	});
});

function createCookieEvent(currentToken: string) {
	let rotatedToken = '';
	return {
		event: asTestEvent<RequestEvent>()({
			cookies: {
				get: () => currentToken,
				set: (_name: string, value: string) => {
					rotatedToken = value;
				}
			}
		}),
		rotatedToken: () => rotatedToken
	};
}

function asTestEvent<Target>() {
	return <Source>(value: Source): Target => {
		// oxlint-disable-next-line anti-slop/no-chained-type-assertions -- Partial RequestEvent fixture containing every field exercised by this unit test.
		return value as unknown as Target;
	};
}

function insertSession(id: string, secret: string): void {
	const now = new Date();
	testDb
		.insert(schema.session)
		.values({
			id,
			userId: 'two-factor-user',
			secretHash: hashSecret(secret),
			createdAt: now,
			lastVerifiedAt: now,
			lastReauthenticatedAt: now
		})
		.run();
}
