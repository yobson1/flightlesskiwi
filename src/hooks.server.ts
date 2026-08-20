import type { Handle, HandleServerError } from '@sveltejs/kit/hooks';
import { building } from '$app/env';
import { ORIGIN } from '$app/env/private';
import { error } from '#lib/logger.js';
import * as auth from '#lib/server/auth.js';
import { authError, getClientIP } from '#lib/server/auth/api.js';
import { startBenchmarkSearchSync } from '#lib/server/benchmark-search.js';
import { seedStores, startIgdbImportScheduler, startIgdbSync } from '#lib/server/igdb-sync.js';
import { isCrossOriginAPIRequest } from '#lib/server/request-origin.js';
import { verifyTurnstileToken } from '#lib/server/turnstile.js';
import { requiresAuthTurnstile, TURNSTILE_RESPONSE_FIELD } from '#lib/turnstile.js';

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

export const handleError: HandleServerError = ({ error: cause, event, kind }) => {
	if (kind === 'unknown') {
		error(`Unhandled 500 error for ${event.request.method} ${event.url.pathname}`, cause);
		return { message: 'An unexpected error occurred' };
	}
	if (cause.status >= 500) return { message: 'An unexpected error occurred' };
};

if (!building) {
	seedStores();
	startBenchmarkSearchSync();
	startIgdbImportScheduler();
	startIgdbSync();
}
