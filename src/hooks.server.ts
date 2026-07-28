import { building } from '$app/env';
import type { Handle, HandleServerError } from '@sveltejs/kit';
import { error } from '$lib/logger';
import * as auth from '$lib/server/auth';
import { startBenchmarkSearchSync } from '$lib/server/benchmark-search';
import { seedStores, startIgdbSync } from '$lib/server/igdb-sync';

export const handle: Handle = async ({ event, resolve }) => {
	const sessionToken = event.cookies.get(auth.sessionCookieName);

	if (!sessionToken) {
		event.locals.user = null;
		event.locals.session = null;
		return resolve(event);
	}

	const { session, user } = await auth.validateSessionToken(sessionToken);

	if (session) {
		auth.setSessionTokenCookie(event, sessionToken, session.expiresAt);
	} else {
		auth.deleteSessionTokenCookie(event);
	}

	event.locals.user = user;
	event.locals.session = session;
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
	startIgdbSync();
}
