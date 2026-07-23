import { fail, redirect } from '@sveltejs/kit';
import {
	setPasswordResetSessionAs2FAVerified,
	validatePasswordResetSessionRequest
} from '$lib/server/auth/password-reset';
import { totpBucket, verifyAndConsumeUserTOTP } from '$lib/server/auth/totp';
import type { Actions, RequestEvent } from './$types';

export function load(event: RequestEvent) {
	const { session, user } = validatePasswordResetSessionRequest(event);
	if (session === null) {
		redirect(302, '/forgot-password');
	}
	if (!session.emailVerified) {
		redirect(302, '/reset-password/verify-email');
	}
	if (!user.registeredTOTP || session.twoFactorVerified) {
		redirect(302, '/reset-password');
	}
	return {};
}

export const actions: Actions = {
	default: verifyCode
};

async function verifyCode(event: RequestEvent) {
	const { session, user } = validatePasswordResetSessionRequest(event);
	if (
		session === null ||
		!session.emailVerified ||
		!user.registeredTOTP ||
		session.twoFactorVerified
	) {
		return fail(403, { message: 'Forbidden' });
	}
	const formData = await event.request.formData();
	const code = formData.get('code');
	if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
		return fail(400, { message: 'Enter your code' });
	}
	if (!totpBucket.consume(session.userId, 1)) {
		return fail(429, { message: 'Too many requests' });
	}
	if (!verifyAndConsumeUserTOTP(session.userId, code)) {
		return fail(400, { message: 'Invalid code' });
	}
	totpBucket.reset(session.userId);
	setPasswordResetSessionAs2FAVerified(session.id);
	redirect(302, '/reset-password');
}
