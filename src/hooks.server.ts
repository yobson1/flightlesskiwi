import { building } from '$app/env';
import { ORIGIN } from '$app/env/private';
import type { Handle, HandleServerError } from '@sveltejs/kit';
import { error } from '$lib/logger';
import * as auth from '$lib/server/auth';
import { authError, getClientIP } from '$lib/server/auth/api';
import { startBenchmarkSearchSync } from '$lib/server/benchmark-search';
import { seedStores, startIgdbImportScheduler, startIgdbSync } from '$lib/server/igdb-sync';
import { isCrossOriginAPIRequest } from '$lib/server/request-origin';
import { verifyTurnstileToken } from '$lib/server/turnstile';
import { requiresAuthTurnstile, TURNSTILE_RESPONSE_FIELD } from '$lib/turnstile';

export const handle: Handle = async ({ event, resolve }) => {
	if (isCrossOriginAPIRequest(event.request, event.url.pathname, new URL(ORIGIN!).origin)) {
		return authError(403, 'Cross-origin API requests are not allowed');
	}

	const sessionToken = event.cookies.get(auth.sessionCookieName);

	if (!sessionToken) {
		event.locals.user = null;
		event.locals.session = null;
	} else {
		const { session, user } = await auth.validateSessionToken(sessionToken);

		if (session) {
			auth.setSessionTokenCookie(event, sessionToken, session.expiresAt);
		} else {
			auth.deleteSessionTokenCookie(event);
		}

		event.locals.user = user;
		event.locals.session = session;
	}

	if (requiresAuthTurnstile(event.url.pathname, event.request.method)) {
		const verified = await verifyTurnstileToken(
			event.request.headers.get(TURNSTILE_RESPONSE_FIELD),
			getClientIP(event),
			event.fetch
		);
		if (!verified) return authError(403, 'Complete the verification challenge');
	}

	return resolve(event);
};

export const handleError: HandleServerError = ({ error: cause, event, status, message }) => {
	error(`Unhandled ${status} error for ${event.request.method} ${event.url.pathname}`, cause);
	return {
		message: status >= 500 ? 'An unexpected error occurred' : message
	};
};

if (!building) {
	seedStores();
	startBenchmarkSearchSync();
	startIgdbImportScheduler();
	startIgdbSync();
}
