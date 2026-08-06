import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import * as schema from '$lib/server/db/schema';
import { createTestDatabase } from '$lib/server/test-db';

const testDatabase = await createTestDatabase();
const testDb = testDatabase.db;

mock.module('$lib/server/db', () => ({ db: testDb }));

const {
	createOrLinkOAuthUser,
	deleteUserOAuthAccount,
	getUserFromOAuthAccount,
	getUserPasswordHash,
	linkUserOAuthAccount
} = await import('./user');

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

	test('does not remove the last usable sign-in method', () => {
		insertUser('oauth-only', 'oauth-only@example.com', null, true, 'OAuth Only');
		insertOAuthAccount('oauth-only', 'twitch', 'twitch-user');

		expect(deleteUserOAuthAccount('oauth-only', 'twitch')).toBe('last-sign-in-method');
		expect(testDb.select().from(schema.oauthAccount).all()).toHaveLength(1);
	});

	test('links a provider directly to the authenticated user without matching email', () => {
		insertUser('target-user', 'local@example.com', 'password-hash', true, 'Target User');

		expect(linkUserOAuthAccount('target-user', 'github', 'github-user')).toBe('linked');
		expect(getUserFromOAuthAccount('github', 'github-user')?.id).toBe('target-user');
	});

	test('does not move a provider identity linked to another user', () => {
		insertUser('first-user', 'first@example.com', 'password-hash', true, 'First User');
		insertUser('second-user', 'second@example.com', 'password-hash', true, 'Second User');
		insertOAuthAccount('first-user', 'discord', 'discord-user');

		expect(linkUserOAuthAccount('second-user', 'discord', 'discord-user')).toBe('provider-in-use');
		expect(getUserFromOAuthAccount('discord', 'discord-user')?.id).toBe('first-user');
	});

	test('does not replace an existing connection for the same provider', () => {
		insertUser('connected-user', 'connected@example.com', 'password-hash', true, 'Connected');
		insertOAuthAccount('connected-user', 'twitch', 'first-twitch-user');

		expect(linkUserOAuthAccount('connected-user', 'twitch', 'second-twitch-user')).toBe(
			'provider-connected'
		);
		expect(getUserFromOAuthAccount('twitch', 'first-twitch-user')?.id).toBe('connected-user');
		expect(getUserFromOAuthAccount('twitch', 'second-twitch-user')).toBeNull();
	});

	test('removes an OAuth connection when a password remains', () => {
		insertUser('password-user', 'password@example.com', 'password-hash', true, 'Password User');
		insertOAuthAccount('password-user', 'github', 'github-user');

		expect(deleteUserOAuthAccount('password-user', 'github')).toBe('deleted');
		expect(testDb.select().from(schema.oauthAccount).all()).toHaveLength(0);
	});

	test('removes an OAuth connection when another provider remains', () => {
		insertUser('multi-oauth', 'multi@example.com', null, true, 'Multi OAuth');
		insertOAuthAccount('multi-oauth', 'github', 'github-user');
		insertOAuthAccount('multi-oauth', 'discord', 'discord-user');

		expect(deleteUserOAuthAccount('multi-oauth', 'github')).toBe('deleted');
		expect(testDb.select().from(schema.oauthAccount).get()?.provider).toBe('discord');
	});

	test('removes an OAuth connection when a passkey remains', () => {
		insertUser('passkey-user', 'passkey@example.com', null, true, 'Passkey User');
		insertOAuthAccount('passkey-user', 'twitch', 'twitch-user');
		testDb
			.insert(schema.passkeyCredential)
			.values({
				id: 'passkey-id',
				userId: 'passkey-user',
				name: 'Test passkey',
				publicKey: Buffer.from([1, 2, 3]),
				createdAt: new Date()
			})
			.run();

		expect(deleteUserOAuthAccount('passkey-user', 'twitch')).toBe('deleted');
		expect(testDb.select().from(schema.oauthAccount).all()).toHaveLength(0);
	});
});

function insertUser(
	id: string,
	email: string,
	passwordHash: string | null,
	emailVerified: boolean,
	username: string
): void {
	testDb
		.insert(schema.user)
		.values({ id, email, username, passwordHash, emailVerified, createdAt: new Date() })
		.run();
}

function insertOAuthAccount(
	userId: string,
	provider: 'github' | 'discord' | 'twitch',
	providerUserId: string
): void {
	testDb
		.insert(schema.oauthAccount)
		.values({ userId, provider, providerUserId, createdAt: new Date() })
		.run();
}
