import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { Discord, generateCodeVerifier, GitHub, Twitch } from './oauth';

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
});
