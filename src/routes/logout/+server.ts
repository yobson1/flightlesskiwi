import { redirect } from '@sveltejs/kit';
import { deleteSessionTokenCookie, invalidateSession } from '$lib/server/auth';
import { deletePendingRecoveryCodeCookie } from '$lib/server/auth/recovery-code';
import type { RequestEvent } from './$types';

export function POST(event: RequestEvent) {
	if (event.locals.session !== null) {
		invalidateSession(event.locals.session.id);
	}
	deleteSessionTokenCookie(event);
	deletePendingRecoveryCodeCookie(event);
	redirect(303, '/login');
}
