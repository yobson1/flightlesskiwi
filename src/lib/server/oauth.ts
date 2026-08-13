import * as client from 'openid-client';
import { encodeBase64 } from '$lib/encoding';
import { isNonArrayObject } from '$lib/utils';

type TokenResponse = Awaited<ReturnType<typeof client.authorizationCodeGrant>>;
const GITHUB_API_VERSION = '2026-03-10';
const TWITCH_TOKEN_ENDPOINT = 'https://id.twitch.tv/oauth2/token';
const TWITCH_REVOCATION_ENDPOINT = 'https://id.twitch.tv/oauth2/revoke';

export interface OAuthUserProfile {
	id: string;
	email: string;
	emailVerified: boolean;
	username: string;
}

export interface OAuthTokenSet {
	accessToken: string;
	refreshToken: string | null;
}

export class OAuth2Tokens {
	constructor(private readonly response: TokenResponse) {}

	accessToken(): string {
		return this.response.access_token;
	}

	tokenSet(): OAuthTokenSet {
		return {
			accessToken: this.response.access_token,
			refreshToken: this.response.refresh_token ?? null
		};
	}

	idTokenClaims(): client.IDToken | undefined {
		return this.response.claims();
	}
}

abstract class OAuth2Provider {
	constructor(
		protected readonly configuration: client.Configuration,
		private readonly redirectURI: string
	) {}

	async createAuthorizationURL(
		state: string,
		codeVerifier: string,
		scopes: string[],
		nonce?: string
	): Promise<URL> {
		const parameters: Record<string, string> = {
			redirect_uri: this.redirectURI,
			scope: scopes.join(' '),
			state,
			code_challenge: await client.calculatePKCECodeChallenge(codeVerifier),
			code_challenge_method: 'S256'
		};
		if (nonce !== undefined) parameters.nonce = nonce;
		this.addAuthorizationParameters(parameters);
		return client.buildAuthorizationUrl(this.configuration, parameters);
	}

	async validateAuthorizationCode(
		callbackURL: URL,
		expectedState: string,
		codeVerifier: string,
		expectedNonce?: string
	): Promise<OAuth2Tokens> {
		const trustedCallbackURL = new URL(this.redirectURI);
		trustedCallbackURL.search = callbackURL.search;
		const response = await client.authorizationCodeGrant(this.configuration, trustedCallbackURL, {
			expectedState,
			pkceCodeVerifier: codeVerifier,
			...(expectedNonce === undefined ? {} : { expectedNonce, idTokenExpected: true as const })
		});
		return new OAuth2Tokens(response);
	}

	abstract getUser(tokens: OAuth2Tokens): Promise<OAuthUserProfile>;

	async revokeTokens(tokens: OAuthTokenSet): Promise<void> {
		const token = tokens.refreshToken ?? tokens.accessToken;
		await client.tokenRevocation(this.configuration, token, {
			token_type_hint: tokens.refreshToken === null ? 'access_token' : 'refresh_token'
		});
	}

	protected addAuthorizationParameters(parameters: Record<string, string>): void {
		void parameters;
	}

	protected async fetchJSON(
		tokens: OAuth2Tokens,
		url: string,
		headers?: Headers
	): Promise<unknown> {
		const response = await client.fetchProtectedResource(
			this.configuration,
			tokens.accessToken(),
			new URL(url),
			'GET',
			undefined,
			headers
		);
		if (!response.ok) {
			await response.body?.cancel();
			throw new OAuthUserProfileError(
				`OAuth profile request failed with status ${response.status}`
			);
		}
		try {
			return await response.json();
		} catch {
			throw new OAuthUserProfileError('OAuth provider returned an invalid profile');
		}
	}
}

export class GitHub extends OAuth2Provider {
	constructor(
		private readonly clientId: string,
		private readonly clientSecret: string,
		redirectURI: string
	) {
		super(
			new client.Configuration(
				{
					issuer: 'https://github.com',
					authorization_endpoint: 'https://github.com/login/oauth/authorize',
					token_endpoint: 'https://github.com/login/oauth/access_token'
				},
				clientId,
				{ client_secret: clientSecret },
				client.ClientSecretBasic(clientSecret)
			),
			redirectURI
		);
	}

	override async revokeTokens(tokens: OAuthTokenSet): Promise<void> {
		const response = await fetch(`https://api.github.com/applications/${this.clientId}/grant`, {
			method: 'DELETE',
			headers: {
				accept: 'application/vnd.github+json',
				authorization: `Basic ${encodeBase64(
					new TextEncoder().encode(`${this.clientId}:${this.clientSecret}`)
				)}`,
				'content-type': 'application/json',
				'X-GitHub-Api-Version': GITHUB_API_VERSION
			},
			body: JSON.stringify({ access_token: tokens.accessToken })
		});
		if (!response.ok) {
			await response.body?.cancel();
			throw new OAuthTokenRevocationError(
				`GitHub authorization revocation failed with status ${response.status}`
			);
		}
		await response.body?.cancel();
	}

	async getUser(tokens: OAuth2Tokens): Promise<OAuthUserProfile> {
		const headers = new Headers({
			accept: 'application/vnd.github+json',
			'X-GitHub-Api-Version': GITHUB_API_VERSION
		});
		const [profile, emails] = await Promise.all([
			this.fetchJSON(tokens, 'https://api.github.com/user', headers),
			this.fetchJSON(tokens, 'https://api.github.com/user/emails', headers)
		]);
		if (
			!isNonArrayObject(profile) ||
			!('id' in profile) ||
			(typeof profile.id !== 'string' && typeof profile.id !== 'number')
		) {
			throw new OAuthUserProfileError('GitHub returned an invalid user profile');
		}
		if (!('login' in profile) || typeof profile.login !== 'string' || !Array.isArray(emails)) {
			throw new OAuthUserProfileError('GitHub returned an invalid user profile');
		}
		const primaryEmail = emails.find(
			(value) =>
				isNonArrayObject(value) &&
				'primary' in value &&
				'verified' in value &&
				'email' in value &&
				value.primary === true &&
				value.verified === true &&
				typeof value.email === 'string'
		);
		if (
			!isNonArrayObject(primaryEmail) ||
			!('email' in primaryEmail) ||
			typeof primaryEmail.email !== 'string'
		) {
			throw new OAuthUserProfileError('GitHub account does not have a verified primary email');
		}
		return {
			id: String(profile.id),
			email: primaryEmail.email,
			emailVerified: true,
			username: profile.login
		};
	}
}

export class Discord extends OAuth2Provider {
	constructor(clientId: string, clientSecret: string, redirectURI: string) {
		super(
			new client.Configuration(
				{
					issuer: 'https://discord.com',
					authorization_endpoint: 'https://discord.com/oauth2/authorize',
					token_endpoint: 'https://discord.com/api/oauth2/token',
					revocation_endpoint: 'https://discord.com/api/oauth2/token/revoke'
				},
				clientId,
				{ client_secret: clientSecret },
				client.ClientSecretBasic(clientSecret)
			),
			redirectURI
		);
	}

	async getUser(tokens: OAuth2Tokens): Promise<OAuthUserProfile> {
		const profile = await this.fetchJSON(tokens, 'https://discord.com/api/v10/users/@me');
		if (
			!isNonArrayObject(profile) ||
			!('id' in profile) ||
			!('username' in profile) ||
			!('email' in profile) ||
			!('verified' in profile) ||
			typeof profile.id !== 'string' ||
			typeof profile.username !== 'string' ||
			typeof profile.email !== 'string' ||
			profile.verified !== true
		) {
			throw new OAuthUserProfileError('Discord account does not have a verified email');
		}
		return {
			id: profile.id,
			email: profile.email,
			emailVerified: true,
			username:
				'global_name' in profile && typeof profile.global_name === 'string'
					? profile.global_name
					: profile.username
		};
	}
}

export class Twitch extends OAuth2Provider {
	private readonly revocationConfiguration: client.Configuration;

	constructor(clientId: string, clientSecret: string, redirectURI: string) {
		const server: client.ServerMetadata = {
			issuer: 'https://id.twitch.tv/oauth2',
			authorization_endpoint: 'https://id.twitch.tv/oauth2/authorize',
			token_endpoint: TWITCH_TOKEN_ENDPOINT,
			revocation_endpoint: TWITCH_REVOCATION_ENDPOINT,
			jwks_uri: 'https://id.twitch.tv/oauth2/keys',
			userinfo_endpoint: 'https://id.twitch.tv/oauth2/userinfo',
			id_token_signing_alg_values_supported: ['RS256']
		};
		const configuration = new client.Configuration(
			server,
			clientId,
			{ client_secret: clientSecret },
			client.ClientSecretPost(clientSecret)
		);
		configuration[client.customFetch] = fetchTwitch;
		super(configuration, redirectURI);
		this.revocationConfiguration = new client.Configuration(server, clientId, {}, client.None());
	}

	async getUser(tokens: OAuth2Tokens): Promise<OAuthUserProfile> {
		const claims = tokens.idTokenClaims();
		if (
			claims === undefined ||
			typeof claims.sub !== 'string' ||
			typeof claims.preferred_username !== 'string' ||
			typeof claims.email !== 'string' ||
			claims.email_verified !== true
		) {
			throw new OAuthUserProfileError('Twitch account does not have a verified email');
		}
		return {
			id: claims.sub,
			email: claims.email,
			emailVerified: true,
			username: claims.preferred_username
		};
	}

	protected override addAuthorizationParameters(parameters: Record<string, string>): void {
		parameters.claims = JSON.stringify({
			id_token: {
				email: null,
				email_verified: null,
				preferred_username: null
			}
		});
	}

	override async revokeTokens(tokens: OAuthTokenSet): Promise<void> {
		try {
			await client.tokenRevocation(this.revocationConfiguration, tokens.accessToken);
			return;
		} catch (cause) {
			if (tokens.refreshToken === null) throw cause;
		}

		const refreshed = await client.refreshTokenGrant(this.configuration, tokens.refreshToken);
		await client.tokenRevocation(this.revocationConfiguration, refreshed.access_token);
	}
}

async function fetchTwitch(url: string, options: client.CustomFetchOptions): Promise<Response> {
	const response = await fetch(url, {
		...options,
		body: options.body as BodyInit | null | undefined
	});
	if (url !== TWITCH_TOKEN_ENDPOINT || !response.ok) return response;

	let body: unknown;
	try {
		body = await response.clone().json();
	} catch {
		return response;
	}
	if (
		!isNonArrayObject(body) ||
		!('scope' in body) ||
		!Array.isArray(body.scope) ||
		!body.scope.every((scope) => typeof scope === 'string')
	) {
		return response;
	}

	const headers = new Headers(response.headers);
	headers.delete('content-length');
	return Response.json(
		{ ...body, scope: body.scope.join(' ') },
		{ status: response.status, statusText: response.statusText, headers }
	);
}

export class OAuthUserProfileError extends Error {}
export class OAuthTokenRevocationError extends Error {}

export function formatOAuthError(cause: unknown): string {
	const errors: string[] = [];
	const seen = new Set<Error>();
	let current = cause;
	while (current instanceof Error && !seen.has(current) && errors.length < 5) {
		seen.add(current);
		const metadata: string[] = [];
		if (isNonArrayObject(current) && 'code' in current && typeof current.code === 'string') {
			metadata.push(current.code);
		}
		if (isNonArrayObject(current) && 'status' in current && typeof current.status === 'number') {
			metadata.push(`HTTP ${current.status}`);
		}
		if (isNonArrayObject(current) && 'error' in current && typeof current.error === 'string') {
			metadata.push(`error=${sanitizeErrorDetail(current.error)}`);
		}
		if (
			isNonArrayObject(current) &&
			'error_description' in current &&
			typeof current.error_description === 'string'
		) {
			metadata.push(`description=${sanitizeErrorDetail(current.error_description)}`);
		}
		const suffix = metadata.length === 0 ? '' : ` (${metadata.join(', ')})`;
		errors.push(`${current.name}: ${sanitizeErrorDetail(current.message)}${suffix}`);
		current = current.cause;
	}
	return errors.join(' caused by ');
}

function sanitizeErrorDetail(value: string): string {
	return value.replaceAll(/\s+/g, ' ').slice(0, 500);
}

export function getAuthorizationResponseError(
	cause: unknown
): OAuthAuthorizationResponseError | null {
	if (!(cause instanceof client.AuthorizationResponseError)) return null;
	return { code: cause.error, description: cause.error_description };
}

export function generateState(): string {
	return client.randomState();
}

export function generateCodeVerifier(): string {
	return client.randomPKCECodeVerifier();
}

export function generateNonce(): string {
	return client.randomNonce();
}

export interface OAuthAuthorizationResponseError {
	code: string;
	description?: string;
}
