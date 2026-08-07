import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { getOAuthErrorMessage } from '$lib/types/oauth';
import {
	Discord,
	formatOAuthError,
	generateCodeVerifier,
	getAuthorizationResponseError,
	GitHub,
	Twitch
} from './oauth';

afterEach(() => {
	mock.restore();
});

describe('OAuth provider clients', () => {
	test('creates a GitHub authorization request with state and PKCE', async () => {
		const github = new GitHub(
			'github-client',
			'github-secret',
			'https://example.com/auth/oauth/github/callback'
		);
		const codeVerifier = generateCodeVerifier();

		const url = await github.createAuthorizationURL('github-state', codeVerifier, ['user:email']);

		expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize');
		expect(url.searchParams.get('client_id')).toBe('github-client');
		expect(url.searchParams.get('redirect_uri')).toBe(
			'https://example.com/auth/oauth/github/callback'
		);
		expect(url.searchParams.get('scope')).toBe('user:email');
		expect(url.searchParams.get('state')).toBe('github-state');
		expect(url.searchParams.get('code_challenge_method')).toBe('S256');
		expect(url.searchParams.get('code_challenge')).not.toBe(codeVerifier);
	});

	test('uses the current GitHub API version for profile and email requests', async () => {
		const requests: Request[] = [];
		spyOn(globalThis, 'fetch').mockImplementation((async (input, init) => {
			const request = new Request(input, init);
			requests.push(request);
			if (request.url === 'https://github.com/login/oauth/access_token') {
				return Response.json({ access_token: 'access-token', token_type: 'bearer' });
			}
			if (request.url === 'https://api.github.com/user') {
				return Response.json({ id: 1, login: 'octocat' });
			}
			return Response.json([{ email: 'octocat@example.com', primary: true, verified: true }]);
		}) as typeof fetch);
		const redirectURI = 'https://example.com/auth/oauth/github/callback';
		const github = new GitHub('github-client', 'github-secret', redirectURI);
		const tokens = await github.validateAuthorizationCode(
			new URL(`${redirectURI}?code=authorization-code&state=expected-state`),
			'expected-state',
			generateCodeVerifier()
		);

		expect(await github.getUser(tokens)).toEqual({
			id: '1',
			email: 'octocat@example.com',
			emailVerified: true,
			username: 'octocat'
		});
		const apiRequests = requests.filter((request) =>
			request.url.startsWith('https://api.github.com/')
		);
		expect(apiRequests).toHaveLength(2);
		expect(
			apiRequests.every((request) => request.headers.get('X-GitHub-Api-Version') === '2026-03-10')
		).toBe(true);
	});

	test('delegates the callback exchange and PKCE verification to openid-client', async () => {
		let tokenRequest: Request | null = null;
		const fetchMock = spyOn(globalThis, 'fetch').mockImplementation((async (input, init) => {
			tokenRequest = new Request(input, init);
			return Response.json({ access_token: 'access-token', token_type: 'bearer' });
		}) as typeof fetch);
		const redirectURI = 'https://example.com/auth/oauth/github/callback';
		const github = new GitHub('github-client', 'github-secret', redirectURI);
		const codeVerifier = generateCodeVerifier();

		const tokens = await github.validateAuthorizationCode(
			new URL(`${redirectURI}?code=authorization-code&state=expected-state`),
			'expected-state',
			codeVerifier
		);

		expect(tokens.accessToken()).toBe('access-token');
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(tokenRequest).not.toBeNull();
		const request = tokenRequest!;
		expect(request.url).toBe('https://github.com/login/oauth/access_token');
		expect(request.headers.get('authorization')).toStartWith('Basic ');
		const body = new URLSearchParams(await request.text());
		expect(body.get('code')).toBe('authorization-code');
		expect(body.get('code_verifier')).toBe(codeVerifier);
		expect(body.get('redirect_uri')).toBe(redirectURI);
	});

	test('rejects a mismatched callback state before contacting the provider', async () => {
		const fetchMock = spyOn(globalThis, 'fetch').mockResolvedValue(
			Response.json({ access_token: 'access-token', token_type: 'bearer' })
		);
		const redirectURI = 'https://example.com/auth/oauth/github/callback';
		const github = new GitHub('github-client', 'github-secret', redirectURI);

		await expect(
			github.validateAuthorizationCode(
				new URL(`${redirectURI}?code=authorization-code&state=wrong-state`),
				'expected-state',
				generateCodeVerifier()
			)
		).rejects.toThrow();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	test('extracts a validated provider cancellation for a user-facing message', async () => {
		const fetchMock = spyOn(globalThis, 'fetch').mockResolvedValue(
			Response.json({ access_token: 'access-token', token_type: 'bearer' })
		);
		const redirectURI = 'https://example.com/auth/oauth/github/callback';
		const github = new GitHub('github-client', 'github-secret', redirectURI);
		const callbackURL = new URL(redirectURI);
		callbackURL.searchParams.set('error', 'access_denied');
		callbackURL.searchParams.set('error_description', 'The user denied the request');
		callbackURL.searchParams.set('state', 'expected-state');

		let cause: unknown;
		try {
			await github.validateAuthorizationCode(callbackURL, 'expected-state', generateCodeVerifier());
		} catch (error) {
			cause = error;
		}

		expect(getAuthorizationResponseError(cause)).toEqual({
			code: 'access_denied',
			description: 'The user denied the request'
		});
		expect(getOAuthErrorMessage('cancelled', 'github')).toBe('GitHub sign-in was cancelled.');
		expect(fetchMock).not.toHaveBeenCalled();
	});

	test('uses Discord OAuth endpoints and scopes', async () => {
		const discord = new Discord(
			'discord-client',
			'discord-secret',
			'https://example.com/auth/oauth/discord/callback'
		);

		const url = await discord.createAuthorizationURL('discord-state', generateCodeVerifier(), [
			'identify',
			'email'
		]);

		expect(url.origin + url.pathname).toBe('https://discord.com/oauth2/authorize');
		expect(url.searchParams.get('scope')).toBe('identify email');
	});

	test('revokes Discord authorization through the standard token revocation operation', async () => {
		let revocationRequest: Request | null = null;
		spyOn(globalThis, 'fetch').mockImplementation((async (input, init) => {
			revocationRequest = new Request(input, init);
			return new Response(null, { status: 200 });
		}) as typeof fetch);
		const discord = new Discord(
			'discord-client',
			'discord-secret',
			'https://example.com/auth/oauth/discord/callback'
		);

		await discord.revokeTokens({
			accessToken: 'discord-access-token',
			refreshToken: 'discord-refresh-token'
		});

		expect(revocationRequest).not.toBeNull();
		const request = revocationRequest!;
		expect(request.url).toBe('https://discord.com/api/oauth2/token/revoke');
		expect(request.method).toBe('POST');
		expect(request.headers.get('authorization')).toStartWith('Basic ');
		const body = new URLSearchParams(await request.text());
		expect(body.get('token')).toBe('discord-refresh-token');
		expect(body.get('token_type_hint')).toBe('refresh_token');
	});

	test('requests Twitch OIDC identity and verified email claims', async () => {
		const twitch = new Twitch(
			'twitch-client',
			'twitch-secret',
			'https://example.com/auth/oauth/twitch/callback'
		);

		const url = await twitch.createAuthorizationURL(
			'twitch-state',
			generateCodeVerifier(),
			['openid', 'user:read:email'],
			'twitch-nonce'
		);

		expect(url.origin + url.pathname).toBe('https://id.twitch.tv/oauth2/authorize');
		expect(url.searchParams.get('nonce')).toBe('twitch-nonce');
		expect(url.searchParams.get('scope')).toBe('openid user:read:email');
		expect(JSON.parse(url.searchParams.get('claims') ?? '{}')).toEqual({
			id_token: {
				email: null,
				email_verified: null,
				preferred_username: null
			}
		});
	});

	test('revokes Twitch authorization through the standard token revocation operation', async () => {
		let revocationRequest: Request | null = null;
		spyOn(globalThis, 'fetch').mockImplementation((async (input, init) => {
			revocationRequest = new Request(input, init);
			return new Response(null, { status: 200 });
		}) as typeof fetch);
		const twitch = new Twitch(
			'twitch-client',
			'twitch-secret',
			'https://example.com/auth/oauth/twitch/callback'
		);

		await twitch.revokeTokens({
			accessToken: 'twitch-access-token',
			refreshToken: 'twitch-refresh-token'
		});

		expect(revocationRequest).not.toBeNull();
		const request = revocationRequest!;
		expect(request.url).toBe('https://id.twitch.tv/oauth2/revoke');
		expect(request.method).toBe('POST');
		const body = new URLSearchParams(await request.text());
		expect(body.get('client_id')).toBe('twitch-client');
		expect(body.get('client_secret')).toBeNull();
		expect(body.get('token')).toBe('twitch-access-token');
	});

	test('refreshes an expired Twitch access token before retrying revocation', async () => {
		const requests: Request[] = [];
		spyOn(globalThis, 'fetch').mockImplementation((async (input, init) => {
			const request = new Request(input, init);
			requests.push(request);
			if (request.url === 'https://id.twitch.tv/oauth2/token') {
				return Response.json({
					access_token: 'fresh-access-token',
					expires_in: 3600,
					refresh_token: 'fresh-refresh-token',
					scope: 'openid user:read:email',
					token_type: 'bearer'
				});
			}
			return requests.length === 1
				? Response.json({ status: 400, message: 'Invalid token' }, { status: 400 })
				: new Response(null, { status: 200 });
		}) as typeof fetch);
		const twitch = new Twitch(
			'twitch-client',
			'twitch-secret',
			'https://example.com/auth/oauth/twitch/callback'
		);

		await twitch.revokeTokens({
			accessToken: 'expired-access-token',
			refreshToken: 'stored-refresh-token'
		});

		expect(requests.map((request) => request.url)).toEqual([
			'https://id.twitch.tv/oauth2/revoke',
			'https://id.twitch.tv/oauth2/token',
			'https://id.twitch.tv/oauth2/revoke'
		]);
		expect(new URLSearchParams(await requests[1]!.text()).get('refresh_token')).toBe(
			'stored-refresh-token'
		);
		expect(new URLSearchParams(await requests[2]!.text()).get('token')).toBe('fresh-access-token');
	});

	test('deletes a GitHub app grant using the provider authorization endpoint', async () => {
		let revocationRequest: Request | null = null;
		spyOn(globalThis, 'fetch').mockImplementation((async (input, init) => {
			revocationRequest = new Request(input, init);
			return new Response(null, { status: 204 });
		}) as typeof fetch);
		const github = new GitHub(
			'github-client',
			'github-secret',
			'https://example.com/auth/oauth/github/callback'
		);

		await github.revokeTokens({ accessToken: 'github-access-token', refreshToken: null });

		expect(revocationRequest).not.toBeNull();
		const request = revocationRequest!;
		expect(request.url).toBe('https://api.github.com/applications/github-client/grant');
		expect(request.method).toBe('DELETE');
		expect(request.headers.get('authorization')).toStartWith('Basic ');
		expect(request.headers.get('X-GitHub-Api-Version')).toBe('2026-03-10');
		expect(await request.json()).toEqual({ access_token: 'github-access-token' });
	});

	test('normalizes Twitch array-valued token scopes before OIDC validation', async () => {
		const fetchMock = spyOn(globalThis, 'fetch').mockResolvedValue(
			Response.json({
				access_token: 'access-token',
				expires_in: 3600,
				id_token: 'invalid-jwt',
				refresh_token: 'refresh-token',
				scope: ['openid', 'user:read:email'],
				token_type: 'bearer'
			})
		);
		const redirectURI = 'https://example.com/auth/oauth/twitch/callback';
		const twitch = new Twitch('twitch-client', 'twitch-secret', redirectURI);

		let cause: unknown;
		try {
			await twitch.validateAuthorizationCode(
				new URL(`${redirectURI}?code=authorization-code&state=expected-state`),
				'expected-state',
				generateCodeVerifier(),
				'expected-nonce'
			);
		} catch (error) {
			cause = error;
		}

		const details = formatOAuthError(cause);
		expect(details).not.toContain('scope" property must be a string');
		expect(details).toContain('JWT');
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	test('formats nested OAuth failures without logging sensitive response bodies', () => {
		const inner = Object.assign(
			new Error('"response" body "scope" property must be a string', {
				cause: { body: { access_token: 'must-not-be-logged' } }
			}),
			{ name: 'OperationProcessingError', code: 'OAUTH_INVALID_RESPONSE' }
		);
		const outer = Object.assign(new Error('invalid response encountered', { cause: inner }), {
			name: 'ClientError',
			code: 'OAUTH_INVALID_RESPONSE'
		});

		const details = formatOAuthError(outer);

		expect(details).toContain('ClientError: invalid response encountered');
		expect(details).toContain('OperationProcessingError');
		expect(details).toContain('"response" body "scope" property must be a string');
		expect(details).not.toContain('must-not-be-logged');
	});
});
