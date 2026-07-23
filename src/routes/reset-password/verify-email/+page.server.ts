import { fail, redirect } from '@sveltejs/kit';
import { getPasswordReset2FARedirect } from '$lib/server/auth/2fa';
import {
	setPasswordResetSessionAsEmailVerified,
	validatePasswordResetSessionRequest,
	verifyPasswordResetCode
} from '$lib/server/auth/password-reset';
import { ExpiringTokenBucket } from '$lib/server/auth/rate-limit';
import { setUserAsEmailVerifiedIfEmailMatches } from '$lib/server/auth/user';
import type { Actions, RequestEvent } from './$types';

const bucket = new ExpiringTokenBucket<string>('password-reset-code', 5, 30 * 60);

export function load(event: RequestEvent) {
	const { session, user } = validatePasswordResetSessionRequest(event);
	if (session === null) {
		redirect(302, '/forgot-password');
	}
	if (session.emailVerified) {
		if (user.registered2FA && !session.twoFactorVerified) {
			redirect(302, getPasswordReset2FARedirect(user));
		}
		redirect(302, '/reset-password');
	}
	return { email: session.email };
}

export const actions: Actions = {
	default: verifyCode
};

async function verifyCode(event: RequestEvent) {
	const { session, user } = validatePasswordResetSessionRequest(event);
	if (session === null) {
		return fail(401, { message: 'Reset session expired' });
	}
	if (session.emailVerified) {
		return fail(403, { message: 'Forbidden' });
	}
	if (!bucket.check(session.userId, 1)) {
		return fail(429, { message: 'Too many requests' });
	}
	const formData = await event.request.formData();
	const code = formData.get('code');
	if (typeof code !== 'string' || code.length === 0) {
		return fail(400, { message: 'Enter your code' });
	}
	if (!bucket.consume(session.userId, 1) || !verifyPasswordResetCode(session, code)) {
		return fail(400, { message: 'Incorrect code' });
	}
	bucket.reset(session.userId);
	setPasswordResetSessionAsEmailVerified(session.id);
	if (!setUserAsEmailVerifiedIfEmailMatches(session.userId, session.email)) {
		return fail(400, { message: 'Please restart the reset process' });
	}
	if (user.registered2FA) {
		redirect(302, getPasswordReset2FARedirect(user));
	}
	redirect(302, '/reset-password');
}
