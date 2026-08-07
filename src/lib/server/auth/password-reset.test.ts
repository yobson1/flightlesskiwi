import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import * as schema from '$lib/server/db/schema';
import { createTestDatabase } from '$lib/server/test-db';
import { TEST_PRIVATE_ENV } from '$lib/server/test-env';

const testDatabase = await createTestDatabase();
const testDb = testDatabase.db;

mock.module('$app/env', () => ({ dev: true }));
mock.module('$app/env/private', () => TEST_PRIVATE_ENV);
mock.module('$lib/server/db', () => ({ db: testDb }));
mock.module('$lib/server/auth/encryption', () => ({
	encrypt: (value: Uint8Array) => Buffer.from(value),
	encryptString: (value: string) => Buffer.from(value),
	decrypt: (value: Uint8Array) => Buffer.from(value),
	decryptToString: (value: Uint8Array) => Buffer.from(value).toString(),
	hashAuthCode: (value: string) => Buffer.from(value)
}));

const {
	completePasswordReset,
	createPasswordResetSession,
	setPasswordResetSessionAsEmailVerified
} = await import('./password-reset');
const { hashSecret } = await import('./utils');
const { verifyPasswordHash } = await import('./password');

beforeEach(() => {
	testDb.delete(schema.user).run();
	testDb
		.insert(schema.user)
		.values({
			id: 'reset-user',
			email: 'reset@example.com',
			username: 'Reset User',
			passwordHash: 'old-password-hash',
			emailVerified: true,
			createdAt: new Date()
		})
		.run();
});

afterAll(() => {
	testDatabase.close();
});

describe('password-reset completion', () => {
	test('allows only one concurrent request to consume the reset capability', async () => {
		const reset = createPasswordResetSession('reset-user', 'reset@example.com');
		setPasswordResetSessionAsEmailVerified(reset.id);
		insertAuthenticatedSession();
		insertLoginAttempt();
		const passwords = ['first-new-password', 'second-new-password'];

		const results = await Promise.all(
			passwords.map((password) => completePasswordReset(reset.id, password))
		);

		expect(results.filter(Boolean)).toHaveLength(1);
		const winningPassword = passwords[results.findIndex(Boolean)]!;
		const updated = testDb.select().from(schema.user).get()!;
		expect(await verifyPasswordHash(updated.passwordHash!, winningPassword)).toBe(true);
		expect(testDb.select().from(schema.passwordResetSession).all()).toHaveLength(0);
		expect(testDb.select().from(schema.session).all()).toHaveLength(0);
		expect(testDb.select().from(schema.loginAttempt).all()).toHaveLength(0);
	});

	test('rechecks current 2FA requirements before consuming the reset', async () => {
		const reset = createPasswordResetSession('reset-user', 'reset@example.com');
		setPasswordResetSessionAsEmailVerified(reset.id);
		testDb
			.insert(schema.totpCredential)
			.values({ userId: 'reset-user', encryptedKey: Buffer.alloc(20) })
			.run();

		expect(await completePasswordReset(reset.id, 'new-password')).toBe(false);
		expect(testDb.select().from(schema.passwordResetSession).all()).toHaveLength(1);
		expect(testDb.select().from(schema.user).get()?.passwordHash).toBe('old-password-hash');
	});
});

function insertAuthenticatedSession(): void {
	const now = new Date();
	testDb
		.insert(schema.session)
		.values({
			id: 'authenticated-session',
			userId: 'reset-user',
			secretHash: hashSecret('session-secret'),
			createdAt: now,
			lastVerifiedAt: now,
			lastReauthenticatedAt: now
		})
		.run();
}

function insertLoginAttempt(): void {
	testDb
		.insert(schema.loginAttempt)
		.values({
			id: 'login-attempt',
			userId: 'reset-user',
			secretHash: hashSecret('attempt-secret'),
			expiresAt: new Date(Date.now() + 60_000)
		})
		.run();
}
