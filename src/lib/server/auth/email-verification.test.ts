import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import * as schema from '#lib/server/db/schema.js';
import { createTestDatabase } from '#lib/server/test-db.js';

const testDatabase = await createTestDatabase();
const testDb = testDatabase.db;

mock.module('$app/env', () => ({ dev: true }));
mock.module('#lib/server/db/index.js', () => ({ db: testDb }));
mock.module('#lib/server/auth/email.js', () => ({ EMAIL_CODE_TTL_MS: 10 * 60 * 1000 }));
mock.module('#lib/server/auth/encryption.js', () => ({
	hashAuthCode: (code: string) => Buffer.from(code)
}));
mock.module('#lib/server/auth/utils.js', () => ({
	constantTimeEqual: (left: Uint8Array, right: Uint8Array) =>
		Buffer.from(left).equals(Buffer.from(right)),
	generateRandomOTP: () => 'ABC123',
	generateSecureRandomString: () => 'verification-request'
}));

const {
	cancelEmailChangeVerificationRequest,
	completeEmailVerificationRequest,
	createEmailChangeVerificationRequest,
	createEmailVerificationRequest
} = await import('./email-verification');

beforeEach(() => {
	testDb.delete(schema.emailVerificationRequest).run();
	testDb.delete(schema.user).run();
});

afterAll(() => {
	testDatabase.close();
});

describe('email changes', () => {
	test('does not replace an active request when another change is submitted', () => {
		insertUser('changing-user', 'old@example.com', true);
		const first = createEmailVerificationRequest('changing-user', 'first@example.com');

		const creation = createEmailChangeVerificationRequest('changing-user', 'second@example.com');

		expect(creation).toEqual({
			created: false,
			request: expect.objectContaining({ id: first.id })
		});
		expect(getRequest('changing-user')).toMatchObject({
			id: first.id,
			email: 'first@example.com'
		});
		expect(getUser('changing-user')).toMatchObject({ emailVerified: false });
	});

	test('replaces an expired request when a new change is submitted', () => {
		insertUser('changing-user', 'old@example.com', true);
		const expired = createEmailVerificationRequest('changing-user', 'expired@example.com');
		testDb
			.update(schema.emailVerificationRequest)
			.set({ expiresAt: new Date(Date.now() - 1) })
			.where(eq(schema.emailVerificationRequest.id, expired.id))
			.run();

		const creation = createEmailChangeVerificationRequest('changing-user', 'new@example.com');

		expect(creation.created).toBe(true);
		expect(getRequest('changing-user')).toMatchObject({ email: 'new@example.com' });
		expect(getUser('changing-user')).toMatchObject({ emailVerified: false });
	});

	test('keeps the old email until the pending email is verified', () => {
		insertUser('changing-user', 'old@example.com', true);

		const creation = createEmailChangeVerificationRequest('changing-user', 'new@example.com');
		if (!creation.created) throw new Error('Expected a new verification request');
		const request = creation.request;

		expect(getUser('changing-user')).toMatchObject({
			email: 'old@example.com',
			emailVerified: false
		});
		expect(getRequest('changing-user')).toMatchObject({ email: 'new@example.com' });

		expect(completeEmailVerificationRequest(request)).toBe(true);
		expect(getUser('changing-user')).toMatchObject({
			email: 'new@example.com',
			emailVerified: true
		});
		expect(getRequest('changing-user')).toBeUndefined();
	});

	test('restores the verified old email when sending the change code fails', () => {
		insertUser('changing-user', 'old@example.com', true);
		const creation = createEmailChangeVerificationRequest('changing-user', 'new@example.com');
		if (!creation.created) throw new Error('Expected a new verification request');

		cancelEmailChangeVerificationRequest(creation.request);

		expect(getUser('changing-user')).toMatchObject({
			email: 'old@example.com',
			emailVerified: true
		});
		expect(getRequest('changing-user')).toBeUndefined();
	});

	test('retains the pending request when the final email swap cannot be committed', () => {
		insertUser('changing-user', 'old@example.com', true);
		insertUser('other-user', 'new@example.com', true);

		const creation = createEmailChangeVerificationRequest('changing-user', 'new@example.com');
		if (!creation.created) throw new Error('Expected a new verification request');
		const request = creation.request;

		expect(() => completeEmailVerificationRequest(request)).toThrow();
		expect(getUser('changing-user')).toMatchObject({
			email: 'old@example.com',
			emailVerified: false
		});
		expect(getRequest('changing-user')).toMatchObject({ email: 'new@example.com' });
	});
});

function insertUser(id: string, email: string, emailVerified: boolean) {
	testDb
		.insert(schema.user)
		.values({
			id,
			email,
			username: id,
			passwordHash: 'password-hash',
			emailVerified,
			recoveryCodeHash: null,
			createdAt: new Date()
		})
		.run();
}

function getUser(id: string) {
	return testDb.select().from(schema.user).where(eq(schema.user.id, id)).get();
}

function getRequest(userId: string) {
	return testDb
		.select()
		.from(schema.emailVerificationRequest)
		.where(eq(schema.emailVerificationRequest.userId, userId))
		.get();
}
