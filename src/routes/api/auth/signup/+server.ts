import { error as logError } from '#lib/logger.js';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '#lib/auth-constants.js';
import { createSessionAndSetCookie } from '#lib/server/auth.js';
import { authError, authSuccess, getClientIP } from '#lib/server/auth/api.js';
import {
	checkCodeEmailSendRateLimit,
	CodeEmailRateLimitError,
	getCodeEmailSendRetryAfterSeconds,
	sendVerificationEmail
} from '#lib/server/auth/email.js';
import {
	createEmailVerificationRequest,
	setEmailVerificationRequestCookie
} from '#lib/server/auth/email-verification.js';
import { verifyPasswordStrength } from '#lib/server/auth/password.js';
import { RefillingTokenBucket } from '#lib/server/auth/rate-limit.js';
import {
	checkEmailAvailability,
	checkUsernameAvailability,
	createUser,
	matchesUserUniqueConstraintError,
	normalizeEmail,
	verifyEmailInput,
	verifyUsernameInput
} from '#lib/server/auth/user.js';
import type { RequestEvent } from './$types';
import * as v from 'valibot';

const ipBucket = new RefillingTokenBucket<string>('signup-ip', 3, 10);
const signupFormSchema = v.object({
	email: v.string(),
	username: v.string(),
	password: v.string()
});

export async function POST(event: RequestEvent) {
	if (event.locals.session !== null) {
		return authError(409, 'Already authenticated');
	}
	const clientIP = getClientIP(event);
	if (!ipBucket.check(clientIP, 1)) {
		return authError(429, 'Too many requests');
	}
	const formData = await event.request.formData();
	const result = v.safeParse(signupFormSchema, {
		email: formData.get('email'),
		username: formData.get('username'),
		password: formData.get('password')
	});
	if (!result.success) {
		return authError(400, 'Invalid or missing fields');
	}
	const { email: rawEmail, username, password } = result.output;
	const email = normalizeEmail(rawEmail);
	if (!verifyEmailInput(email)) return authError(400, 'Invalid email');
	if (!verifyUsernameInput(username)) return authError(400, 'Invalid username');
	if (!verifyPasswordStrength(password)) {
		return authError(
			400,
			`Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters`
		);
	}
	if (!ipBucket.consume(clientIP, 1)) return authError(429, 'Too many requests');
	if (!checkEmailAvailability(email)) return authError(400, 'Email is already used');
	if (!checkUsernameAvailability(username)) return authError(400, 'Username is already used');
	if (!checkCodeEmailSendRateLimit(email)) {
		return authError(429, 'Too many requests', {
			retryAfterSeconds: getCodeEmailSendRetryAfterSeconds(email)
		});
	}

	let user;
	try {
		user = await createUser(email, username, password);
	} catch (cause) {
		if (matchesUserUniqueConstraintError(cause, 'email')) {
			return authError(400, 'Email is already used');
		}
		if (matchesUserUniqueConstraintError(cause, 'username')) {
			return authError(400, 'Username is already used');
		}
		logError('Failed to create auth user', cause);
		return authError(500, 'Unable to create account');
	}

	const verificationRequest = createEmailVerificationRequest(user.id, user.email);
	setEmailVerificationRequestCookie(event, verificationRequest);
	createSessionAndSetCookie(event, user.id);
	try {
		const retryAfterSeconds = await sendVerificationEmail(
			verificationRequest.email,
			verificationRequest.code
		);
		return authSuccess('verify-email', { retryAfterSeconds });
	} catch (cause) {
		if (!(cause instanceof CodeEmailRateLimitError)) {
			logError('Failed to send signup verification email', cause);
		}
		return authSuccess('verify-email', {
			message: 'Account created. Use “Send another code” to retry the verification email.',
			retryAfterSeconds:
				cause instanceof CodeEmailRateLimitError
					? cause.retryAfterSeconds
					: getCodeEmailSendRetryAfterSeconds(verificationRequest.email)
		});
	}
}
