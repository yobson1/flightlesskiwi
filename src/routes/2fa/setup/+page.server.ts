import { redirect } from '@sveltejs/kit';
import { get2FARedirect } from '$lib/server/auth/2fa';
import type { RequestEvent } from './$types';

export function load(event: RequestEvent) {
	if (event.locals.session === null || event.locals.user === null) {
		redirect(302, '/login');
	}
	if (!event.locals.user.emailVerified) {
		redirect(302, '/verify-email');
	}
	if (event.locals.user.registered2FA && !event.locals.session.twoFactorVerified) {
		redirect(302, get2FARedirect(event.locals.user));
	}
	return {
		user: event.locals.user,
		totpSetupUrl: '/2fa/totp/setup',
		passkeySetupUrl: '/2fa/passkey/register'
	};
}
