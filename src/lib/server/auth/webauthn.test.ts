import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import * as schema from '$lib/server/db/schema';
import { createTestDatabase } from '$lib/server/test-db';

const testDatabase = await createTestDatabase();
const testDb = testDatabase.db;

mock.module('$lib/server/db', () => ({ db: testDb }));

const {
	consumeWebAuthnChallenge,
	isWebAuthnChallengeValid,
	storeWebAuthnChallenge,
	WEBAUTHN_SUPPORTED_ALGORITHM_IDS
} = await import('./webauthn');

beforeEach(() => {
	testDb.delete(schema.webAuthnChallenge).run();
	testDb.delete(schema.user).run();
	insertUser('first-user');
	insertUser('second-user');
});

afterAll(() => {
	testDatabase.close();
});

describe('WebAuthn challenge storage', () => {
	test('binds a generated options challenge to its user and purpose and consumes it once', () => {
		storeWebAuthnChallenge('generated-registration-challenge', 'first-user', 'passkey-register');

		expect(
			isWebAuthnChallengeValid('generated-registration-challenge', 'first-user', 'passkey-register')
		).toBe(true);
		expect(
			isWebAuthnChallengeValid(
				'generated-registration-challenge',
				'second-user',
				'passkey-register'
			)
		).toBe(false);
		expect(
			isWebAuthnChallengeValid('generated-registration-challenge', 'first-user', 'passkey-2fa')
		).toBe(false);

		expect(
			consumeWebAuthnChallenge('generated-registration-challenge', 'first-user', 'passkey-register')
		).toBe(true);
		expect(
			consumeWebAuthnChallenge('generated-registration-challenge', 'first-user', 'passkey-register')
		).toBe(false);
	});

	test('keeps the generated and verified algorithm policy identical', () => {
		expect(WEBAUTHN_SUPPORTED_ALGORITHM_IDS).toEqual([-7, -257]);
	});
});

function insertUser(id: string): void {
	testDb
		.insert(schema.user)
		.values({
			id,
			email: `${id}@example.com`,
			username: id,
			passwordHash: 'password-hash',
			emailVerified: true,
			createdAt: new Date()
		})
		.run();
}
