import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import * as schema from '$lib/server/db/schema';
import { createTestDatabase } from '$lib/server/test-db';

const testDatabase = await createTestDatabase();
const testDb = testDatabase.db;

mock.module('$lib/server/db', () => ({ db: testDb }));

const { createOrLinkOAuthUser, getUserFromOAuthAccount, getUserPasswordHash } =
	await import('./user');

beforeEach(() => {
	testDb.delete(schema.oauthAccount).run();
	testDb.delete(schema.user).run();
});

afterAll(() => {
	testDatabase.close();
});

describe('OAuth users', () => {
	test('creates an email-verified account without a usable password', () => {
		const user = createOrLinkOAuthUser('github', {
			id: 'github-user',
			email: 'OAUTH@Example.com',
			emailVerified: true,
			username: 'oauth-user'
		});

		expect(user).toMatchObject({
			email: 'oauth@example.com',
			emailVerified: true,
			hasPassword: false,
			oauthProviders: ['github']
		});
		expect(getUserPasswordHash(user.id)).toBeNull();
		expect(testDb.select().from(schema.user).get()?.passwordHash).toBeNull();
		expect(getUserFromOAuthAccount('github', 'github-user')?.id).toBe(user.id);
	});

	test('links a verified provider email to the existing local account', () => {
		insertUser('existing-user', 'linked@example.com', 'password-hash', false, 'Existing');

		const user = createOrLinkOAuthUser('discord', {
			id: 'discord-user',
			email: 'linked@example.com',
			emailVerified: true,
			username: 'Discord User'
		});

		expect(user).toMatchObject({
			id: 'existing-user',
			emailVerified: true,
			hasPassword: true,
			oauthProviders: ['discord']
		});
		expect(getUserPasswordHash(user.id)).toBe('password-hash');
	});

	test('keeps a linked provider identity attached when its upstream email changes', () => {
		const first = createOrLinkOAuthUser('twitch', {
			id: 'twitch-user',
			email: 'first@example.com',
			emailVerified: true,
			username: 'Twitch User'
		});

		const second = createOrLinkOAuthUser('twitch', {
			id: 'twitch-user',
			email: 'changed@example.com',
			emailVerified: true,
			username: 'Changed Name'
		});

		expect(second.id).toBe(first.id);
		expect(second.email).toBe('first@example.com');
		expect(testDb.select().from(schema.user).all()).toHaveLength(1);
	});

	test('chooses an available username without duplicating provider logic', () => {
		insertUser('existing-user', 'existing@example.com', 'password-hash', true, 'Taken Name');

		const user = createOrLinkOAuthUser('github', {
			id: 'second-github-user',
			email: 'new@example.com',
			emailVerified: true,
			username: 'Taken Name'
		});

		expect(user.username).toBe('Taken Name 2');
	});

	test('rejects an unverified provider email', () => {
		expect(() =>
			createOrLinkOAuthUser('discord', {
				id: 'unverified-user',
				email: 'unverified@example.com',
				emailVerified: false,
				username: 'Unverified'
			})
		).toThrow();
		expect(testDb.select().from(schema.user).all()).toHaveLength(0);
	});
});

function insertUser(
	id: string,
	email: string,
	passwordHash: string,
	emailVerified: boolean,
	username: string
): void {
	testDb
		.insert(schema.user)
		.values({ id, email, username, passwordHash, emailVerified, createdAt: new Date() })
		.run();
}
