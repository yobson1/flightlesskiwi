import { error as logError } from '$lib/logger';
import { authError, authSuccess, requireAuthenticated } from '$lib/server/auth/api';
import { sendVerificationEmail } from '$lib/server/auth/email';
import {
	createEmailVerificationRequest,
	deleteEmailVerificationRequestCookie,
	deleteUserEmailVerificationRequest,
	getUserEmailVerificationRequestFromRequest,
	sendVerificationEmailBucket,
	setEmailVerificationRequestCookie,
	verifyEmailVerificationCode
} from '$lib/server/auth/email-verification';
import { invalidateUserPasswordResetSessions } from '$lib/server/auth/password-reset';
import { ExpiringTokenBucket } from '$lib/server/auth/rate-limit';
import { updateUserEmailAndSetEmailAsVerified } from '$lib/server/auth/user';
import type { RequestEvent } from './$types';

const verifyBucket = new ExpiringTokenBucket<string>('email-verification-code', 5, 30 * 60);

export async function POST(event: RequestEvent) {
	const guarded = requireAuthenticated(event);
	if (guarded.response) return guarded.response;
	const { session, user } = guarded.authenticated;
	if (user.registered2FA && !session.twoFactorVerified) {
		return authError(403, 'Complete two-factor authentication first');
	}
	if (user.emailVerified) return authError(409, 'Email is already verified');

	const current = getUserEmailVerificationRequestFromRequest(event);
	if (current !== null && current.expiresAt > new Date()) {
		return authSuccess('verify-email', { sent: false });
	}
	if (!sendVerificationEmailBucket.consume(user.id, 1)) {
		return authError(429, 'Too many verification emails requested');
	}

	const request = createEmailVerificationRequest(user.id, user.email);
	setEmailVerificationRequestCookie(event, request);
	try {
		await sendVerificationEmail(request.email, request.code);
	} catch (cause) {
		logError('Failed to restore email verification request', cause);
		return authError(503, 'The verification email could not be sent');
	}
	return authSuccess('verify-email', { sent: true });
}

export async function PUT(event: RequestEvent) {
	const guarded = requireAuthenticated(event);
	if (guarded.response) return guarded.response;
	const { session, user } = guarded.authenticated;
	if (user.registered2FA && !session.twoFactorVerified) {
		return authError(403, 'Complete two-factor authentication first');
	}
	const request = getUserEmailVerificationRequestFromRequest(event);
	if (request === null) return authError(401, 'Verification request expired');
	if (!verifyBucket.check(user.id, 1)) return authError(429, 'Too many requests');
	const formData = await event.request.formData();
	const code = formData.get('code');
	if (typeof code !== 'string' || code.length === 0) {
		return authError(400, 'Enter your code');
	}
	if (!verifyBucket.consume(user.id, 1)) return authError(429, 'Too many requests');
	if (!verifyEmailVerificationCode(request, code)) {
		return authError(400, 'Incorrect or expired code');
	}

	verifyBucket.reset(user.id);
	deleteUserEmailVerificationRequest(user.id);
	invalidateUserPasswordResetSessions(user.id);
	updateUserEmailAndSetEmailAsVerified(user.id, request.email);
	deleteEmailVerificationRequestCookie(event);
	return authSuccess(user.registered2FA ? null : 'setup');
}

export async function PATCH(event: RequestEvent) {
	const guarded = requireAuthenticated(event);
	if (guarded.response) return guarded.response;
	const { session, user } = guarded.authenticated;
	if (user.registered2FA && !session.twoFactorVerified) {
		return authError(403, 'Complete two-factor authentication first');
	}
	if (!sendVerificationEmailBucket.consume(user.id, 1)) {
		return authError(429, 'Too many requests');
	}
	const current = getUserEmailVerificationRequestFromRequest(event);
	const email = current?.email ?? user.email;
	if (current === null && user.emailVerified) {
		return authError(403, 'Email is already verified');
	}
	const request = createEmailVerificationRequest(user.id, email);
	setEmailVerificationRequestCookie(event, request);
	try {
		await sendVerificationEmail(request.email, request.code);
	} catch (cause) {
		logError('Failed to resend verification email', cause);
		return authError(503, 'The verification email could not be sent');
	}
	return authSuccess('verify-email', { message: 'A new code was sent to your inbox.' });
}
