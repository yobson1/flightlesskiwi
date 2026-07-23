import { redirect } from '@sveltejs/kit';
import { get2FARedirect } from '$lib/server/auth/2fa';
import type { RequestEvent } from './$types';

export function load(event: RequestEvent) {
	event.setHeaders({ 'cache-control': 'no-store' });
	if (event.locals.session === null || event.locals.user === null) {
		redirect(302, '/login');
	}
	if (!event.locals.user.emailVerified || !event.locals.user.registered2FA) {
		redirect(302, '/2fa/setup');
	}
	if (!event.locals.session.twoFactorVerified) {
		redirect(302, get2FARedirect(event.locals.user));
	}
	if (!event.locals.user.registeredTOTP || event.locals.user.recoveryCodeConfigured) {
		redirect(302, '/');
	}
	return {};
}
