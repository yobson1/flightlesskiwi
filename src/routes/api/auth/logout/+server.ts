import { deleteSessionTokenCookie, invalidateSession } from '#lib/server/auth.js';
import { authSuccess } from '#lib/server/auth/api.js';
import { deletePendingRecoveryCodeCookie } from '#lib/server/auth/recovery-code.js';
import type { RequestEvent } from './$types';

export function POST(event: RequestEvent) {
	if (event.locals.session !== null) invalidateSession(event.locals.session.id);
	deleteSessionTokenCookie(event);
	deletePendingRecoveryCodeCookie(event);
	return authSuccess('login');
}
