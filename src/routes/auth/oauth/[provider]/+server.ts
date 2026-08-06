import { redirect } from '@sveltejs/kit';
import { error as logError } from '$lib/logger';
import { getClientIP } from '$lib/server/auth/api';
import { invalidateLoginAttemptRequest } from '$lib/server/auth/login-attempt';
import {
	createOAuthAuthorizationURL,
	normalizeOAuthReturnTo,
	OAuthConfigurationError
} from '$lib/server/auth/oauth';
import { RefillingTokenBucket } from '$lib/server/auth/rate-limit';
import { isOAuthProvider } from '$lib/types/oauth';
import type { RequestEvent } from './$types';

const authorizationBucket = new RefillingTokenBucket<string>('oauth-authorization-ip', 20, 60);

export async function GET(event: RequestEvent) {
	if (!isOAuthProvider(event.params.provider)) {
		return new Response('OAuth provider not found', { status: 404 });
	}
	if (!authorizationBucket.consume(getClientIP(event), 1)) {
		return new Response('Too many requests', { status: 429 });
	}

	const flow = event.url.searchParams.get('flow') === 'reauth' ? 'reauth' : 'login';
	let returnTo: string | null = null;
	if (flow === 'reauth') {
		if (event.locals.session === null || event.locals.user === null) {
			redirect(303, '/#login');
		}
		if (!event.locals.user.oauthProviders.includes(event.params.provider)) {
			return new Response('OAuth provider is not linked to this account', { status: 403 });
		}
		if (event.locals.user.registeredTOTP || event.locals.user.registeredPasskey) {
			return new Response('Use a configured second factor to re-authenticate', { status: 403 });
		}
		returnTo = normalizeOAuthReturnTo(event.url.searchParams.get('return_to')) ?? '/settings';
	} else {
		if (event.locals.session !== null) redirect(303, '/');
		invalidateLoginAttemptRequest(event);
		const requestedReturnTo = normalizeOAuthReturnTo(event.url.searchParams.get('return_to'));
		returnTo = requestedReturnTo === '/#signup' ? requestedReturnTo : '/#login';
	}

	let authorizationURL: URL;
	try {
		authorizationURL = await createOAuthAuthorizationURL(
			event,
			event.params.provider,
			flow,
			returnTo
		);
	} catch (cause) {
		if (!(cause instanceof OAuthConfigurationError)) {
			logError(`Failed to start ${event.params.provider} OAuth`, cause);
		}
		return new Response('OAuth provider is unavailable', { status: 503 });
	}
	redirect(303, authorizationURL.href);
}
