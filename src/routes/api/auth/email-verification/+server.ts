import { error as logError } from '#lib/logger.js';
import { authError, authSuccess, requireAuthenticated } from '#lib/server/auth/api.js';
import {
	checkCodeEmailSendRateLimit,
	CodeEmailRateLimitError,
	getCodeEmailSendRetryAfterSeconds,
	sendVerificationEmail
} from '#lib/server/auth/email.js';
import {
	completeEmailVerificationRequest,
	createEmailVerificationRequest,
	deleteEmailVerificationRequestCookie,
	getUserEmailVerificationRequestFromRequest,
	setEmailVerificationRequestCookie,
	verifyEmailVerificationCode
} from '#lib/server/auth/email-verification.js';
import { invalidateUserPasswordResetSessions } from '#lib/server/auth/password-reset.js';
import { ExpiringTokenBucket } from '#lib/server/auth/rate-limit.js';
import { matchesUserUniqueConstraintError } from '#lib/server/auth/user.js';
import type { RequestEvent } from './$types';
import * as v from 'valibot';

const verifyBucket = new ExpiringTokenBucket<string>('email-verification-code', 5, 30 * 60);
const verificationCodeSchema = v.pipe(v.string(), v.nonEmpty());

export async function POST(event: RequestEvent) {
	const guarded = requireAuthenticated(event);
	if (guarded.response) return guarded.response;
	const { user } = guarded.authenticated;
	if (user.emailVerified) return authError(409, 'Email is already verified');

	const current = getUserEmailVerificationRequestFromRequest(event);
	if (current !== null && current.expiresAt > new Date()) {
		return authSuccess('verify-email', {
			sent: false,
			retryAfterSeconds: getCodeEmailSendRetryAfterSeconds(current.email)
		});
	}
	const email = current?.email ?? user.email;
	if (!checkCodeEmailSendRateLimit(email)) {
		return verificationEmailRateLimitError(email);
	}

	const request = createEmailVerificationRequest(user.id, email);
	setEmailVerificationRequestCookie(event, request);
	try {
		const retryAfterSeconds = await sendVerificationEmail(request.email, request.code);
		return authSuccess('verify-email', { sent: true, retryAfterSeconds });
	} catch (cause) {
		if (cause instanceof CodeEmailRateLimitError) {
			return verificationEmailRateLimitError(request.email, cause.retryAfterSeconds);
		}
		logError('Failed to restore email verification request', cause);
		return authError(503, 'The verification email could not be sent');
	}
}

export async function PUT(event: RequestEvent) {
	const guarded = requireAuthenticated(event);
	if (guarded.response) return guarded.response;
	const { user } = guarded.authenticated;
	const request = getUserEmailVerificationRequestFromRequest(event);
	if (request === null) return authError(401, 'Verification request expired');
	if (!verifyBucket.check(user.id, 1)) return authError(429, 'Too many requests');
	const formData = await event.request.formData();
	const codeResult = v.safeParse(verificationCodeSchema, formData.get('code'));
	if (!codeResult.success) {
		return authError(400, 'Enter your code');
	}
	const code = codeResult.output;
	if (!verifyBucket.consume(user.id, 1)) return authError(429, 'Too many requests');
	if (!verifyEmailVerificationCode(request, code)) {
		return authError(400, 'Incorrect or expired code');
	}

	const isEmailChange = request.email !== user.email;
	verifyBucket.reset(user.id);
	try {
		if (!completeEmailVerificationRequest(request)) {
			return authError(401, 'Verification request expired');
		}
	} catch (cause) {
		if (matchesUserUniqueConstraintError(cause, 'email')) {
			return authError(409, 'Email is already used');
		}
		logError('Failed to complete email verification', cause);
		return authError(500, 'Unable to verify your email');
	}
	invalidateUserPasswordResetSessions(user.id);
	deleteEmailVerificationRequestCookie(event);
	return authSuccess(isEmailChange || user.registered2FA ? null : 'setup');
}

export async function PATCH(event: RequestEvent) {
	const guarded = requireAuthenticated(event);
	if (guarded.response) return guarded.response;
	const { user } = guarded.authenticated;
	const current = getUserEmailVerificationRequestFromRequest(event);
	const email = current?.email ?? user.email;
	if (!checkCodeEmailSendRateLimit(email)) {
		return verificationEmailRateLimitError(email);
	}
	if (current === null && user.emailVerified) {
		return authError(403, 'Email is already verified');
	}
	const request = createEmailVerificationRequest(user.id, email);
	setEmailVerificationRequestCookie(event, request);
	try {
		const retryAfterSeconds = await sendVerificationEmail(request.email, request.code);
		return authSuccess('verify-email', {
			message: 'A new code was sent to your inbox.',
			retryAfterSeconds
		});
	} catch (cause) {
		if (cause instanceof CodeEmailRateLimitError) {
			return verificationEmailRateLimitError(request.email, cause.retryAfterSeconds);
		}
		logError('Failed to resend verification email', cause);
		return authError(503, 'The verification email could not be sent');
	}
}

function verificationEmailRateLimitError(email: string, retryAfterSeconds?: number): Response {
	return authError(429, 'Too many verification emails requested', {
		retryAfterSeconds: retryAfterSeconds ?? getCodeEmailSendRetryAfterSeconds(email)
	});
}
