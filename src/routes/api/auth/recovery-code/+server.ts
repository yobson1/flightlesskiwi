import { json } from '@sveltejs/kit';
import { getUserRecoveryCode } from '$lib/server/auth/user';
import type { RequestEvent } from './$types';

export function GET(event: RequestEvent) {
	event.setHeaders({ 'cache-control': 'no-store' });
	if (event.locals.session === null || event.locals.user === null) {
		return new Response('Not authenticated', { status: 401 });
	}
	if (
		!event.locals.user.emailVerified ||
		!event.locals.user.registered2FA ||
		!event.locals.session.twoFactorVerified
	) {
		return new Response('Forbidden', { status: 403 });
	}
	return json({ recoveryCode: getUserRecoveryCode(event.locals.user.id) });
}
