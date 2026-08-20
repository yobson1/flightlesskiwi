import { redirect } from '@sveltejs/kit';
import { error as logError } from '#lib/logger.js';
import { hasRecentReauthentication } from '#lib/server/auth.js';
import { getClientIP } from '#lib/server/auth/api.js';
import { invalidateLoginAttemptRequest } from '#lib/server/auth/login-attempt.js';
import {
	createOAuthAuthorizationURL,
	normalizeOAuthReturnTo,
	OAuthConfigurationError
} from '#lib/server/auth/oauth.js';
import { RefillingTokenBucket } from '#lib/server/auth/rate-limit.js';
import { createOAuthErrorRedirect, parseOAuthProvider } from '#lib/types/oauth.js';
import type { RequestEvent } from './$types';

const authorizationBucket = new RefillingTokenBucket<string>('oauth-authorization-ip', 20, 60);

export async function GET(event: RequestEvent) {
	const provider = parseOAuthProvider(event.params.provider);
	if (provider === null) {
		return new Response('OAuth provider not found', { status: 404 });
	}
	if (!authorizationBucket.consume(getClientIP(event), 1)) {
		return new Response('Too many requests', { status: 429 });
	}

	const flowParameter = event.url.searchParams.get('flow');
	const flow = flowParameter === 'reauth' || flowParameter === 'link' ? flowParameter : 'login';
	let returnTo: string | null;
	if (flow === 'reauth') {
		if (event.locals.session === null || event.locals.user === null) {
			redirect(303, '/#login');
		}
		if (!event.locals.user.oauthProviders.includes(provider)) {
			return new Response('OAuth provider is not linked to this account', { status: 403 });
		}
		if (event.locals.user.registeredTOTP || event.locals.user.registeredPasskey) {
			return new Response('Use a configured second factor to re-authenticate', { status: 403 });
		}
		returnTo = normalizeOAuthReturnTo(event.url.searchParams.get('return_to')) ?? '/settings';
	} else if (flow === 'link') {
		returnTo = normalizeOAuthReturnTo(event.url.searchParams.get('return_to')) ?? '/settings';
		if (event.locals.session === null || event.locals.user === null) {
			redirect(303, createOAuthErrorRedirect('/#login', 'session', provider, event.url));
		}
		if (!event.locals.user.emailVerified) {
			redirect(303, createOAuthErrorRedirect(returnTo, 'factor', provider, event.url));
		}
		if (!hasRecentReauthentication(event.locals.session)) {
			redirect(303, createOAuthErrorRedirect(returnTo, 'reauthentication', provider, event.url));
		}
		if (event.locals.user.oauthProviders.includes(provider)) {
			redirect(303, createOAuthErrorRedirect(returnTo, 'connection-exists', provider, event.url));
		}
	} else {
		if (event.locals.session !== null) redirect(303, '/');
		invalidateLoginAttemptRequest(event);
		const requestedReturnTo = normalizeOAuthReturnTo(event.url.searchParams.get('return_to'));
		returnTo = requestedReturnTo === '/#signup' ? requestedReturnTo : '/#login';
	}

	let authorizationURL: URL;
	try {
		authorizationURL = await createOAuthAuthorizationURL(event, provider, flow, returnTo);
	} catch (cause) {
		if (!(cause instanceof OAuthConfigurationError)) {
			logError(`Failed to start ${provider} OAuth`, cause);
		}
		return new Response('OAuth provider is unavailable', { status: 503 });
	}
	redirect(303, authorizationURL.href);
}
