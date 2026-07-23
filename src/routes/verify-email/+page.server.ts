import { fail, redirect } from '@sveltejs/kit';
import { error as logError } from '$lib/logger';
import {
	createEmailVerificationRequest,
	deleteEmailVerificationRequestCookie,
	deleteUserEmailVerificationRequest,
	getUserEmailVerificationRequestFromRequest,
	sendVerificationEmailBucket,
	setEmailVerificationRequestCookie,
	verifyEmailVerificationCode
} from '$lib/server/auth/email-verification';
import { sendVerificationEmail } from '$lib/server/auth/email';
import { invalidateUserPasswordResetSessions } from '$lib/server/auth/password-reset';
import { ExpiringTokenBucket } from '$lib/server/auth/rate-limit';
import { updateUserEmailAndSetEmailAsVerified } from '$lib/server/auth/user';
import type { Actions, RequestEvent } from './$types';

const verifyBucket = new ExpiringTokenBucket<string>('email-verification-code', 5, 30 * 60);

export async function load(event: RequestEvent) {
	if (event.locals.session === null || event.locals.user === null) {
		redirect(302, '/login');
	}
	if (event.locals.user.registered2FA && !event.locals.session.twoFactorVerified) {
		redirect(302, '/2fa');
	}
	let request = getUserEmailVerificationRequestFromRequest(event);
	if (request === null || request.expiresAt <= new Date()) {
		if (event.locals.user.emailVerified) {
			redirect(302, '/');
		}
		const createdRequest = createEmailVerificationRequest(
			event.locals.user.id,
			event.locals.user.email
		);
		request = createdRequest;
		setEmailVerificationRequestCookie(event, createdRequest);
		try {
			await sendVerificationEmail(createdRequest.email, createdRequest.code);
		} catch (cause) {
			logError('Failed to send verification email', cause);
			return {
				email: request.email,
				emailError: 'The verification email could not be sent.'
			};
		}
	}
	return { email: request.email, emailError: null };
}

export const actions: Actions = {
	verify: verifyCode,
	resend: resendEmail
};

async function verifyCode(event: RequestEvent) {
	if (event.locals.session === null || event.locals.user === null) {
		return fail(401, { verify: { message: 'Not authenticated' } });
	}
	if (event.locals.user.registered2FA && !event.locals.session.twoFactorVerified) {
		return fail(403, { verify: { message: 'Forbidden' } });
	}
	const request = getUserEmailVerificationRequestFromRequest(event);
	if (request === null) {
		return fail(401, { verify: { message: 'Verification request expired' } });
	}
	if (!verifyBucket.check(event.locals.user.id, 1)) {
		return fail(429, { verify: { message: 'Too many requests' } });
	}
	const formData = await event.request.formData();
	const code = formData.get('code');
	if (typeof code !== 'string' || code.length === 0) {
		return fail(400, { verify: { message: 'Enter your code' } });
	}
	if (!verifyBucket.consume(event.locals.user.id, 1)) {
		return fail(429, { verify: { message: 'Too many requests' } });
	}
	if (!verifyEmailVerificationCode(request, code)) {
		return fail(400, { verify: { message: 'Incorrect or expired code' } });
	}

	verifyBucket.reset(event.locals.user.id);
	deleteUserEmailVerificationRequest(event.locals.user.id);
	invalidateUserPasswordResetSessions(event.locals.user.id);
	updateUserEmailAndSetEmailAsVerified(event.locals.user.id, request.email);
	deleteEmailVerificationRequestCookie(event);
	if (!event.locals.user.registered2FA) {
		redirect(302, '/2fa/setup');
	}
	redirect(302, '/');
}

async function resendEmail(event: RequestEvent) {
	if (event.locals.session === null || event.locals.user === null) {
		return fail(401, { resend: { message: 'Not authenticated' } });
	}
	if (event.locals.user.registered2FA && !event.locals.session.twoFactorVerified) {
		return fail(403, { resend: { message: 'Forbidden' } });
	}
	if (!sendVerificationEmailBucket.consume(event.locals.user.id, 1)) {
		return fail(429, { resend: { message: 'Too many requests' } });
	}
	const current = getUserEmailVerificationRequestFromRequest(event);
	const email = current?.email ?? event.locals.user.email;
	if (current === null && event.locals.user.emailVerified) {
		return fail(403, { resend: { message: 'Email is already verified' } });
	}
	const request = createEmailVerificationRequest(event.locals.user.id, email);
	setEmailVerificationRequestCookie(event, request);
	try {
		await sendVerificationEmail(request.email, request.code);
	} catch (cause) {
		logError('Failed to resend verification email', cause);
		return fail(503, {
			resend: { message: 'The verification email could not be sent' }
		});
	}
	return { resend: { message: 'A new code was sent to your inbox.' } };
}
