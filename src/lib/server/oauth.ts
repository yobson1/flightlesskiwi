import * as client from 'openid-client';
import { isRecord } from '$lib/utils';

type TokenResponse = Awaited<ReturnType<typeof client.authorizationCodeGrant>>;

export interface OAuthUserProfile {
	id: string;
	email: string;
	emailVerified: boolean;
	username: string;
}

export class OAuth2Tokens {
	constructor(private readonly response: TokenResponse) {}

	accessToken(): string {
		return this.response.access_token;
	}

	idTokenClaims(): client.IDToken | undefined {
		return this.response.claims();
	}
}

abstract class OAuth2Provider {
	constructor(
		private readonly configuration: client.Configuration,
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
	constructor(clientId: string, clientSecret: string, redirectURI: string) {
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

	async getUser(tokens: OAuth2Tokens): Promise<OAuthUserProfile> {
		const headers = new Headers({
			accept: 'application/vnd.github+json',
			'X-GitHub-Api-Version': '2022-11-28'
		});
		const [profile, emails] = await Promise.all([
			this.fetchJSON(tokens, 'https://api.github.com/user', headers),
			this.fetchJSON(tokens, 'https://api.github.com/user/emails', headers)
		]);
		if (!isRecord(profile) || (typeof profile.id !== 'string' && typeof profile.id !== 'number')) {
			throw new OAuthUserProfileError('GitHub returned an invalid user profile');
		}
		if (typeof profile.login !== 'string' || !Array.isArray(emails)) {
			throw new OAuthUserProfileError('GitHub returned an invalid user profile');
		}
		const primaryEmail = emails.find(
			(value) =>
				isRecord(value) &&
				value.primary === true &&
				value.verified === true &&
				typeof value.email === 'string'
		);
		if (!isRecord(primaryEmail) || typeof primaryEmail.email !== 'string') {
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
					token_endpoint: 'https://discord.com/api/oauth2/token'
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
			!isRecord(profile) ||
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
			username: typeof profile.global_name === 'string' ? profile.global_name : profile.username
		};
	}
}

export class Twitch extends OAuth2Provider {
	constructor(clientId: string, clientSecret: string, redirectURI: string) {
		super(
			new client.Configuration(
				{
					issuer: 'https://id.twitch.tv/oauth2',
					authorization_endpoint: 'https://id.twitch.tv/oauth2/authorize',
					token_endpoint: 'https://id.twitch.tv/oauth2/token',
					jwks_uri: 'https://id.twitch.tv/oauth2/keys',
					userinfo_endpoint: 'https://id.twitch.tv/oauth2/userinfo',
					id_token_signing_alg_values_supported: ['RS256']
				},
				clientId,
				{ client_secret: clientSecret },
				client.ClientSecretPost(clientSecret)
			),
			redirectURI
		);
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
}

export class OAuthUserProfileError extends Error {}

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
