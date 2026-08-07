import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { isRedirect } from '@sveltejs/kit';
import { encodeBase64, encodeBase64url } from '$lib/encoding';
import * as schema from '$lib/server/db/schema';
import type { OAuthTokenSet, OAuthUserProfile } from '$lib/server/oauth';
import { createTestDatabase } from '$lib/server/test-db';
import { TEST_PRIVATE_ENV } from '$lib/server/test-env';
import type { OAuthErrorCode, OAuthProvider } from '$lib/types/oauth';

const testDatabase = await createTestDatabase();
const testDb = testDatabase.db;

let callback: TestOAuthCallback;
let callbackError: TestOAuthCallbackError | null = null;
const revokedAuthorizations: Array<{ provider: OAuthProvider; tokens: OAuthTokenSet }> = [];

class TestOAuthCallbackError extends Error {
	constructor(
		message: string,
		readonly code: OAuthErrorCode,
		readonly flow: TestOAuthCallback['flow'] = 'login',
		readonly returnTo: string | null = null,
		options?: ErrorOptions
	) {
		super(message, options);
	}
}

mock.module('$app/env', () => ({ building: false, dev: true }));
mock.module('$app/env/private', () => TEST_PRIVATE_ENV);
mock.module('$lib/server/db', () => ({ db: testDb }));
mock.module('$lib/server/auth/encryption', () => ({
	encrypt: (value: Uint8Array) => Buffer.from(value),
	encryptString: (value: string) => Buffer.from(value),
	decrypt: (value: Uint8Array) => Buffer.from(value),
	decryptToString: (value: Uint8Array) => Buffer.from(value).toString(),
	hashAuthCode: (value: string) => Buffer.from(value)
}));
mock.module('$lib/server/auth/oauth', () => ({
	OAuthCallbackError: TestOAuthCallbackError,
	validateOAuthCallback: async () => {
		if (callbackError !== null) throw callbackError;
		return callback;
	},
	revokeOAuthTokens: async (provider: OAuthProvider, tokens: OAuthTokenSet) => {
		revokedAuthorizations.push({ provider, tokens });
	}
}));
mock.module('$lib/server/benchmark-files', () => ({
	deleteBenchmarkFiles: async () => {}
}));
mock.module('$lib/server/benchmark-search', () => ({
	flushBenchmarkSearchQueue: async () => {},
	queueBenchmarksForSearch: () => {}
}));

const { validateSessionToken } = await import('$lib/server/auth');
const { hashSecret } = await import('$lib/server/auth/utils');
const { GET: completeOAuth } = await import('./auth/oauth/[provider]/callback/+server');
const { actions: settingsActions } = await import('./settings/+page.server');

beforeEach(() => {
	testDb.delete(schema.user).run();
	callbackError = null;
	callback = {
		profile: {
			id: 'github-user',
			email: 'oauth@example.com',
			emailVerified: true,
			username: 'OAuth User'
		},
		tokens: { accessToken: 'new-access-token', refreshToken: null },
		flow: 'login',
		returnTo: null
	};
	revokedAuthorizations.length = 0;
});

afterAll(() => {
	testDatabase.close();
});

describe('OAuth callback orchestration', () => {
	test('turns an OAuth first factor into a login attempt when the linked account has 2FA', async () => {
		insertUser('oauth-login-user', null);
		insertOAuthAccount('oauth-login-user', 'github', callback.profile.id, 'old-access-token');
		insertTOTP('oauth-login-user');
		const cookies = createCookieJar();

		const redirect = await getRedirect(
			completeOAuth(createOAuthEvent('github', cookies, { session: null, user: null }))
		);

		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe('/#login-2fa');
		expect(cookies.get('login_attempt')).toBeString();
		expect(testDb.select().from(schema.loginAttempt).all()).toHaveLength(1);
		expect(testDb.select().from(schema.session).all()).toHaveLength(0);
		expect(testDb.select().from(schema.oauthAccount).get()?.encryptedAccessToken).toEqual(
			Buffer.from('new-access-token')
		);
	});

	test('links the callback identity directly to the recently reauthenticated user', async () => {
		insertUser('oauth-link-user', 'password-hash');
		callback.flow = 'link';
		callback.returnTo = '/settings';
		const authenticated = createAuthenticatedRequest('oauth-link-user');

		const redirect = await getRedirect(
			completeOAuth(createOAuthEvent('github', authenticated.cookies, authenticated.locals))
		);

		expect(redirect.location).toBe('/settings?oauth_connected=github');
		expect(testDb.select().from(schema.oauthAccount).get()).toMatchObject({
			provider: 'github',
			providerUserId: callback.profile.id,
			userId: 'oauth-link-user',
			encryptedAccessToken: Buffer.from('new-access-token')
		});
	});

	test('updates OAuth tokens and rotates the session after provider reauthentication', async () => {
		insertUser('oauth-reauth-user', null);
		insertOAuthAccount('oauth-reauth-user', 'github', callback.profile.id, 'old-access-token');
		callback.flow = 'reauth';
		callback.returnTo = '/settings';
		const authenticated = createAuthenticatedRequest('oauth-reauth-user');
		const previousToken = authenticated.cookies.get('session')!;

		const redirect = await getRedirect(
			completeOAuth(createOAuthEvent('github', authenticated.cookies, authenticated.locals))
		);

		expect(redirect.location).toBe('/settings');
		expect(authenticated.cookies.get('session')).not.toBe(previousToken);
		expect(validateSessionToken(previousToken).session).toBeNull();
		expect(validateSessionToken(authenticated.cookies.get('session')!).session?.userId).toBe(
			'oauth-reauth-user'
		);
		expect(testDb.select().from(schema.oauthAccount).get()?.encryptedAccessToken).toEqual(
			Buffer.from('new-access-token')
		);
	});
});

describe('settings credential removal orchestration', () => {
	test('removes TOTP and its recovery code through the guarded action', async () => {
		insertUser('remove-totp-user', 'password-hash', 'recovery-code-hash');
		insertTOTP('remove-totp-user');
		const authenticated = createAuthenticatedRequest('remove-totp-user');

		const result = await settingsActions.disconnect_totp!(
			createSettingsEvent(authenticated, new URLSearchParams())
		);

		expect(result).toEqual({});
		expect(testDb.select().from(schema.totpCredential).all()).toHaveLength(0);
		expect(testDb.select().from(schema.user).get()?.recoveryCodeHash).toBeNull();
		expect(authenticated.cookies.deleted).toContain('recovery_code_setup');
	});

	test('removes only the submitted passkey credential through the guarded action', async () => {
		insertUser('remove-passkey-user', 'password-hash');
		const credentialId = Buffer.from('credential-id');
		testDb
			.insert(schema.passkeyCredential)
			.values({
				id: encodeBase64url(credentialId),
				userId: 'remove-passkey-user',
				name: 'Passkey',
				publicKey: Buffer.from('public-key'),
				createdAt: new Date()
			})
			.run();
		const authenticated = createAuthenticatedRequest('remove-passkey-user');

		const result = await settingsActions.delete_passkey!(
			createSettingsEvent(
				authenticated,
				new URLSearchParams({ credential_id: encodeBase64(credentialId) })
			)
		);

		expect(result).toEqual({});
		expect(testDb.select().from(schema.passkeyCredential).all()).toHaveLength(0);
	});

	test('deletes an OAuth connection and passes its stored tokens to provider revocation', async () => {
		insertUser('remove-oauth-user', 'password-hash');
		insertOAuthAccount(
			'remove-oauth-user',
			'github',
			'connected-github-user',
			'github-access-token'
		);
		const authenticated = createAuthenticatedRequest('remove-oauth-user');

		const result = await settingsActions.disconnect_oauth!(
			createSettingsEvent(authenticated, new URLSearchParams({ provider: 'github' }))
		);

		expect(result).toEqual({
			connection: { message: 'Disconnected GitHub and revoked its authorization' }
		});
		expect(testDb.select().from(schema.oauthAccount).all()).toHaveLength(0);
		expect(revokedAuthorizations).toEqual([
			{
				provider: 'github',
				tokens: { accessToken: 'github-access-token', refreshToken: null }
			}
		]);
	});
});

function createOAuthEvent(
	provider: string,
	cookies: CookieJar,
	locals: { session: App.Locals['session']; user: App.Locals['user'] }
) {
	const url = new URL(`https://example.com/auth/oauth/${provider}/callback?code=test-code`);
	return {
		params: { provider },
		url,
		request: new Request(url),
		cookies,
		locals
	} as unknown as Parameters<typeof completeOAuth>[0];
}

function createSettingsEvent(
	authenticated: ReturnType<typeof createAuthenticatedRequest>,
	form: URLSearchParams
) {
	return {
		locals: authenticated.locals,
		cookies: authenticated.cookies,
		request: new Request('https://example.com/settings', { method: 'POST', body: form })
	} as unknown as SettingsActionEvent;
}

function createAuthenticatedRequest(userId: string) {
	const token = `${crypto.randomUUID()}.${crypto.randomUUID()}`;
	const [id, secret] = token.split('.') as [string, string];
	const now = new Date();
	testDb
		.insert(schema.session)
		.values({
			id,
			userId,
			secretHash: hashSecret(secret),
			createdAt: now,
			lastVerifiedAt: now,
			lastReauthenticatedAt: now
		})
		.run();
	const cookies = createCookieJar({ session: token });
	const validated = validateSessionToken(token);
	if (validated.session === null || validated.user === null) {
		throw new Error('Failed to create authenticated test request');
	}
	return { cookies, locals: validated };
}

function insertUser(
	userId: string,
	passwordHash: string | null,
	recoveryCodeHash: string | null = null
) {
	testDb
		.insert(schema.user)
		.values({
			id: userId,
			email: `${userId}@example.com`,
			username: userId,
			passwordHash,
			recoveryCodeHash,
			emailVerified: true,
			createdAt: new Date()
		})
		.run();
}

function insertOAuthAccount(
	userId: string,
	provider: OAuthProvider,
	providerUserId: string,
	accessToken: string
) {
	testDb
		.insert(schema.oauthAccount)
		.values({
			userId,
			provider,
			providerUserId,
			encryptedAccessToken: Buffer.from(accessToken),
			createdAt: new Date()
		})
		.run();
}

function insertTOTP(userId: string) {
	testDb
		.insert(schema.totpCredential)
		.values({ userId, encryptedKey: Buffer.from('totp-key') })
		.run();
}

async function getRedirect(request: Promise<unknown>) {
	try {
		await request;
	} catch (cause) {
		if (isRedirect(cause)) return cause;
		throw cause;
	}
	throw new Error('Expected request to redirect');
}

function createCookieJar(initial: Record<string, string> = {}) {
	const values = new Map(Object.entries(initial));
	const deleted: string[] = [];
	return {
		deleted,
		get: (name: string) => values.get(name),
		set: (name: string, value: string) => values.set(name, value),
		delete: (name: string) => {
			deleted.push(name);
			return values.delete(name);
		}
	};
}

type CookieJar = ReturnType<typeof createCookieJar>;
type SettingsActionEvent = Parameters<NonNullable<typeof settingsActions.disconnect_totp>>[0];

interface TestOAuthCallback {
	profile: OAuthUserProfile;
	tokens: OAuthTokenSet;
	flow: 'login' | 'reauth' | 'link';
	returnTo: string | null;
}
