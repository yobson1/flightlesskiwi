import { dev } from '$app/env';
import {
	DISCORD_OAUTH_CLIENT_ID,
	DISCORD_OAUTH_CLIENT_SECRET,
	GITHUB_OAUTH_CLIENT_ID,
	GITHUB_OAUTH_CLIENT_SECRET,
	TWITCH_OAUTH_CLIENT_ID,
	TWITCH_OAUTH_CLIENT_SECRET,
	WEBAUTHN_ORIGIN
} from '$app/env/private';
import type { RequestEvent } from '@sveltejs/kit';
import { decodeBase64url, encodeBase64url } from '$lib/encoding';
import { decryptToString, encryptString } from '$lib/server/auth/encryption';
import * as oauth from '$lib/server/oauth';
import { OAUTH_PROVIDERS, type OAuthErrorCode, type OAuthProvider } from '$lib/types/oauth';
import { isRecord } from '$lib/utils';

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

const providerScopes: Record<OAuthProvider, string[]> = {
	github: ['user:email'],
	discord: ['identify', 'email'],
	twitch: ['openid', 'user:read:email']
};

export function getEnabledOAuthProviders(): OAuthProvider[] {
	return OAUTH_PROVIDERS.filter((provider) => getOAuthCredentials(provider) !== null);
}

export async function createOAuthAuthorizationURL(
	event: RequestEvent,
	provider: OAuthProvider,
	flow: OAuthFlow,
	returnTo: string | null
): Promise<URL> {
	const oauthClient = getOAuthClient(provider);
	if (oauthClient === null) throw new OAuthConfigurationError(`${provider} OAuth is not enabled`);

	const state = oauth.generateState();
	const codeVerifier = oauth.generateCodeVerifier();
	const nonce = provider === 'twitch' ? oauth.generateNonce() : undefined;
	const expiresAt = Date.now() + OAUTH_STATE_TTL_MS;
	const payload: OAuthState = { state, codeVerifier, nonce, flow, returnTo, expiresAt };
	event.cookies.set(
		oauthStateCookieName(provider),
		encodeBase64url(encryptString(JSON.stringify(payload))),
		{
			httpOnly: true,
			path: oauthCallbackPath(provider),
			secure: !dev,
			sameSite: 'lax',
			expires: new Date(expiresAt)
		}
	);

	return oauthClient.createAuthorizationURL(state, codeVerifier, providerScopes[provider], nonce);
}

export async function validateOAuthCallback(
	event: RequestEvent,
	provider: OAuthProvider
): Promise<OAuthCallback> {
	const state = consumeOAuthState(event, provider);
	if (state === null) throw new OAuthCallbackError('OAuth sign-in request expired', 'expired');
	const oauthClient = getOAuthClient(provider);
	if (oauthClient === null) throw new OAuthConfigurationError(`${provider} OAuth is not enabled`);

	try {
		const tokens = await oauthClient.validateAuthorizationCode(
			event.url,
			state.state,
			state.codeVerifier,
			state.nonce
		);
		const profile = await oauthClient.getUser(tokens);
		if (!profile.emailVerified) {
			throw new OAuthCallbackError(
				'OAuth email is not verified',
				'unverified-email',
				state.flow,
				state.returnTo
			);
		}
		return { profile, flow: state.flow, returnTo: state.returnTo };
	} catch (cause) {
		if (cause instanceof OAuthCallbackError) throw cause;
		const authorizationError = oauth.getAuthorizationResponseError(cause);
		if (authorizationError !== null) {
			throw new OAuthCallbackError(
				authorizationError.description ?? authorizationError.code,
				getOAuthCallbackErrorCode(authorizationError.code),
				state.flow,
				state.returnTo,
				{ cause }
			);
		}
		throw new OAuthCallbackError(
			'OAuth provider verification failed',
			'failed',
			state.flow,
			state.returnTo,
			{ cause }
		);
	}
}

export function normalizeOAuthReturnTo(value: string | null): string | null {
	if (value === null || !value.startsWith('/') || value.startsWith('//')) return null;
	const origin = new URL(WEBAUTHN_ORIGIN!);
	const url = new URL(value, origin);
	if (url.origin !== origin.origin) return null;
	return `${url.pathname}${url.search}${url.hash}`;
}

function getOAuthClient(
	provider: OAuthProvider
): oauth.GitHub | oauth.Discord | oauth.Twitch | null {
	const credentials = getOAuthCredentials(provider);
	if (credentials === null) return null;
	const redirectURI = new URL(oauthCallbackPath(provider), WEBAUTHN_ORIGIN!).href;
	switch (provider) {
		case 'github':
			return new oauth.GitHub(credentials.clientId, credentials.clientSecret, redirectURI);
		case 'discord':
			return new oauth.Discord(credentials.clientId, credentials.clientSecret, redirectURI);
		case 'twitch':
			return new oauth.Twitch(credentials.clientId, credentials.clientSecret, redirectURI);
	}
}

function getOAuthCredentials(provider: OAuthProvider): OAuthCredentials | null {
	let clientId: string | undefined;
	let clientSecret: string | undefined;
	switch (provider) {
		case 'github':
			clientId = GITHUB_OAUTH_CLIENT_ID;
			clientSecret = GITHUB_OAUTH_CLIENT_SECRET;
			break;
		case 'discord':
			clientId = DISCORD_OAUTH_CLIENT_ID;
			clientSecret = DISCORD_OAUTH_CLIENT_SECRET;
			break;
		case 'twitch':
			clientId = TWITCH_OAUTH_CLIENT_ID;
			clientSecret = TWITCH_OAUTH_CLIENT_SECRET;
			break;
	}
	if ((clientId === undefined) !== (clientSecret === undefined)) {
		throw new OAuthConfigurationError(`${provider} OAuth client ID and secret must both be set`);
	}
	return clientId === undefined || clientSecret === undefined ? null : { clientId, clientSecret };
}

function consumeOAuthState(event: RequestEvent, provider: OAuthProvider): OAuthState | null {
	const cookieName = oauthStateCookieName(provider);
	const value = event.cookies.get(cookieName);
	event.cookies.delete(cookieName, {
		httpOnly: true,
		path: oauthCallbackPath(provider),
		secure: !dev,
		sameSite: 'lax'
	});
	if (!value) return null;

	try {
		const state = JSON.parse(decryptToString(decodeBase64url(value))) as unknown;
		if (
			!isRecord(state) ||
			typeof state.state !== 'string' ||
			typeof state.codeVerifier !== 'string' ||
			(state.nonce !== undefined && typeof state.nonce !== 'string') ||
			(state.flow !== 'login' && state.flow !== 'reauth' && state.flow !== 'link') ||
			(state.returnTo !== null && typeof state.returnTo !== 'string') ||
			typeof state.expiresAt !== 'number' ||
			state.expiresAt <= Date.now()
		) {
			return null;
		}
		return state as unknown as OAuthState;
	} catch {
		return null;
	}
}

function oauthStateCookieName(provider: OAuthProvider): string {
	return `oauth_${provider}_state`;
}

function oauthCallbackPath(provider: OAuthProvider): string {
	return `/auth/oauth/${provider}/callback`;
}

export class OAuthConfigurationError extends Error {}
export class OAuthCallbackError extends Error {
	constructor(
		message: string,
		readonly code: OAuthErrorCode,
		readonly flow: OAuthFlow = 'login',
		readonly returnTo: string | null = null,
		options?: ErrorOptions
	) {
		super(message, options);
	}
}

function getOAuthCallbackErrorCode(code: string): OAuthErrorCode {
	switch (code) {
		case 'access_denied':
			return 'cancelled';
		case 'temporarily_unavailable':
		case 'server_error':
			return 'unavailable';
		case 'invalid_request':
		case 'unauthorized_client':
		case 'unsupported_response_type':
		case 'invalid_scope':
			return 'rejected';
		default:
			return 'failed';
	}
}

interface OAuthCredentials {
	clientId: string;
	clientSecret: string;
}

interface OAuthState {
	state: string;
	codeVerifier: string;
	nonce?: string;
	flow: OAuthFlow;
	returnTo: string | null;
	expiresAt: number;
}

export interface OAuthCallback {
	profile: oauth.OAuthUserProfile;
	flow: OAuthFlow;
	returnTo: string | null;
}

export type OAuthFlow = 'login' | 'reauth' | 'link';
