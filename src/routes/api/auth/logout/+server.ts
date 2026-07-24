import { deleteSessionTokenCookie, invalidateSession } from '$lib/server/auth';
import { authSuccess } from '$lib/server/auth/api';
import { deletePendingRecoveryCodeCookie } from '$lib/server/auth/recovery-code';
import type { RequestEvent } from './$types';

export function POST(event: RequestEvent) {
	if (event.locals.session !== null) invalidateSession(event.locals.session.id);
	deleteSessionTokenCookie(event);
	deletePendingRecoveryCodeCookie(event);
	return authSuccess('login');
}
