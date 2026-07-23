import { fail, redirect } from '@sveltejs/kit';
import { createSession, generateSessionToken, setSessionTokenCookie } from '$lib/server/auth';
import { getPasswordReset2FARedirect } from '$lib/server/auth/2fa';
import { verifyPasswordStrength } from '$lib/server/auth/password';
import {
	deletePasswordResetSessionTokenCookie,
	invalidateUserPasswordResetSessions,
	validatePasswordResetSessionRequest
} from '$lib/server/auth/password-reset';
import { updateUserPassword } from '$lib/server/auth/user';
import type { Actions, RequestEvent } from './$types';

export function load(event: RequestEvent) {
	const { session, user } = validatePasswordResetSessionRequest(event);
	if (session === null) {
		redirect(302, '/forgot-password');
	}
	if (!session.emailVerified) {
		redirect(302, '/reset-password/verify-email');
	}
	if (user.registered2FA && !session.twoFactorVerified) {
		redirect(302, getPasswordReset2FARedirect(user));
	}
	return {};
}

export const actions: Actions = {
	default: resetPassword
};

async function resetPassword(event: RequestEvent) {
	const { session: resetSession, user } = validatePasswordResetSessionRequest(event);
	if (resetSession === null) {
		return fail(401, { message: 'Reset session expired' });
	}
	if (!resetSession.emailVerified || (user.registered2FA && !resetSession.twoFactorVerified)) {
		return fail(403, { message: 'Forbidden' });
	}
	const formData = await event.request.formData();
	const password = formData.get('password');
	if (typeof password !== 'string' || !verifyPasswordStrength(password)) {
		return fail(400, {
			message: 'Password must be between 12 and 255 characters'
		});
	}
	await updateUserPassword(user.id, password);
	invalidateUserPasswordResetSessions(user.id);

	const token = generateSessionToken();
	const session = createSession(token, user.id, {
		twoFactorVerified: resetSession.twoFactorVerified || !user.registered2FA
	});
	setSessionTokenCookie(event, token, session.expiresAt);
	deletePasswordResetSessionTokenCookie(event);
	redirect(302, '/');
}
