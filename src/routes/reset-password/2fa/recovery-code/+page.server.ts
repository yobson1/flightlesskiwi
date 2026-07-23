import { fail, redirect } from '@sveltejs/kit';
import { recoveryCodeBucket, resetUser2FAWithRecoveryCode } from '$lib/server/auth/2fa';
import {
	setPasswordResetSessionAs2FAVerified,
	validatePasswordResetSessionRequest
} from '$lib/server/auth/password-reset';
import type { Actions, RequestEvent } from './$types';

export function load(event: RequestEvent) {
	const { session, user } = validatePasswordResetSessionRequest(event);
	if (session === null) {
		redirect(302, '/forgot-password');
	}
	if (!session.emailVerified) {
		redirect(302, '/reset-password/verify-email');
	}
	if (!user.registered2FA || session.twoFactorVerified) {
		redirect(302, '/reset-password');
	}
	return {};
}

export const actions: Actions = {
	default: verifyRecoveryCode
};

async function verifyRecoveryCode(event: RequestEvent) {
	const { session, user } = validatePasswordResetSessionRequest(event);
	if (
		session === null ||
		!session.emailVerified ||
		!user.registered2FA ||
		session.twoFactorVerified
	) {
		return fail(403, { message: 'Forbidden' });
	}
	const formData = await event.request.formData();
	const code = formData.get('code');
	if (typeof code !== 'string' || code.length === 0) {
		return fail(400, { message: 'Enter your recovery code' });
	}
	if (
		!recoveryCodeBucket.consume(session.userId, 1) ||
		!resetUser2FAWithRecoveryCode(session.userId, code)
	) {
		return fail(400, { message: 'Invalid recovery code' });
	}
	recoveryCodeBucket.reset(session.userId);
	setPasswordResetSessionAs2FAVerified(session.id);
	redirect(302, '/reset-password');
}
