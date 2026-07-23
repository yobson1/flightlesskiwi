import { redirect } from '@sveltejs/kit';
import { get2FARedirect } from '$lib/server/auth/2fa';
import type { RequestEvent } from './$types';

export function GET(event: RequestEvent) {
	if (event.locals.session === null || event.locals.user === null) {
		redirect(302, '/login');
	}
	if (event.locals.session.twoFactorVerified) {
		redirect(302, '/');
	}
	if (!event.locals.user.registered2FA) {
		redirect(302, '/2fa/setup');
	}
	redirect(302, get2FARedirect(event.locals.user));
}
