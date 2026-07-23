import { fail, redirect } from '@sveltejs/kit';
import { error as logError } from '$lib/logger';
import { sendPasswordResetEmail } from '$lib/server/auth/email';
import {
	createPasswordResetSession,
	setPasswordResetSessionTokenCookie
} from '$lib/server/auth/password-reset';
import { RefillingTokenBucket } from '$lib/server/auth/rate-limit';
import { getClientIP } from '$lib/server/auth/routes';
import { getUserFromEmail, normalizeEmail, verifyEmailInput } from '$lib/server/auth/user';
import type { Actions, RequestEvent } from './$types';

const ipBucket = new RefillingTokenBucket<string>('password-reset-ip', 3, 60);
const userBucket = new RefillingTokenBucket<string>('password-reset-user', 3, 60);

export const actions: Actions = {
	default: requestReset
};

async function requestReset(event: RequestEvent) {
	const clientIP = getClientIP(event);
	if (!ipBucket.check(clientIP, 1)) {
		return fail(429, { message: 'Too many requests', email: '' });
	}
	const formData = await event.request.formData();
	const rawEmail = formData.get('email');
	if (typeof rawEmail !== 'string') {
		return fail(400, { message: 'Invalid or missing fields', email: '' });
	}
	const email = normalizeEmail(rawEmail);
	if (!verifyEmailInput(email)) {
		return fail(400, { message: 'Invalid email', email });
	}
	if (!ipBucket.consume(clientIP, 1)) {
		return fail(429, { message: 'Too many requests', email: '' });
	}
	const user = getUserFromEmail(email);
	if (user === null) {
		// Do not reveal whether the address is registered.
		return {
			message: 'If an account uses that email, a reset code has been sent.',
			email: ''
		};
	}
	if (!userBucket.consume(user.id, 1)) {
		return fail(429, { message: 'Too many requests', email: '' });
	}
	const session = createPasswordResetSession(user.id, user.email);
	setPasswordResetSessionTokenCookie(event, session.token, session.expiresAt);
	try {
		await sendPasswordResetEmail(session.email, session.code);
	} catch (cause) {
		logError('Failed to send password reset email', cause);
		return fail(503, {
			message: 'The password reset email could not be sent',
			email: ''
		});
	}
	redirect(302, '/reset-password/verify-email');
}
