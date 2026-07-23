import { redirect } from '@sveltejs/kit';
import { deleteSessionTokenCookie, invalidateSession } from '$lib/server/auth';
import type { RequestEvent } from './$types';

export function POST(event: RequestEvent) {
	if (event.locals.session !== null) {
		invalidateSession(event.locals.session.id);
	}
	deleteSessionTokenCookie(event);
	redirect(303, '/login');
}
