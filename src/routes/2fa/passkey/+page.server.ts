import { redirect } from '@sveltejs/kit';
import { get2FARedirect } from '$lib/server/auth/2fa';
import { getUserPasskeyCredentials } from '$lib/server/auth/webauthn';
import type { RequestEvent } from './$types';

export function load(event: RequestEvent) {
	if (event.locals.session === null || event.locals.user === null) {
		redirect(302, '/login');
	}
	if (!event.locals.user.emailVerified) {
		redirect(302, '/verify-email');
	}
	if (!event.locals.user.registered2FA) {
		redirect(302, '/2fa/setup');
	}
	if (event.locals.session.twoFactorVerified) {
		redirect(302, '/');
	}
	if (!event.locals.user.registeredPasskey) {
		redirect(302, get2FARedirect(event.locals.user));
	}
	return {
		user: event.locals.user,
		credentials: getUserPasskeyCredentials(event.locals.user.id)
	};
}
