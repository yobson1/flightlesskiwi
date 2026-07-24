import { error as logError } from '$lib/logger';
import { createSessionAndSetCookie, type SessionFlags } from '$lib/server/auth';
import { authError, authSuccess, getClientIP } from '$lib/server/auth/api';
import { sendVerificationEmail } from '$lib/server/auth/email';
import {
	createEmailVerificationRequest,
	setEmailVerificationRequestCookie
} from '$lib/server/auth/email-verification';
import { verifyPasswordStrength } from '$lib/server/auth/password';
import { RefillingTokenBucket } from '$lib/server/auth/rate-limit';
import {
	checkEmailAvailability,
	checkUsernameAvailability,
	createUser,
	isUserUniqueConstraintError,
	normalizeEmail,
	verifyEmailInput,
	verifyUsernameInput
} from '$lib/server/auth/user';
import type { RequestEvent } from './$types';

const ipBucket = new RefillingTokenBucket<string>('signup-ip', 3, 10);

export async function POST(event: RequestEvent) {
	if (event.locals.session !== null) {
		return authError(409, 'Already authenticated');
	}
	const clientIP = getClientIP(event);
	if (!ipBucket.check(clientIP, 1)) {
		return authError(429, 'Too many requests');
	}
	const formData = await event.request.formData();
	const rawEmail = formData.get('email');
	const username = formData.get('username');
	const password = formData.get('password');
	if (
		typeof rawEmail !== 'string' ||
		typeof username !== 'string' ||
		typeof password !== 'string'
	) {
		return authError(400, 'Invalid or missing fields');
	}
	const email = normalizeEmail(rawEmail);
	if (!verifyEmailInput(email)) return authError(400, 'Invalid email');
	if (!verifyUsernameInput(username)) return authError(400, 'Invalid username');
	if (!verifyPasswordStrength(password)) {
		return authError(400, 'Password must be between 12 and 255 characters');
	}
	if (!ipBucket.consume(clientIP, 1)) return authError(429, 'Too many requests');
	if (!checkEmailAvailability(email)) return authError(400, 'Email is already used');
	if (!checkUsernameAvailability(username)) return authError(400, 'Username is already used');

	let user;
	try {
		user = await createUser(email, username, password);
	} catch (cause) {
		if (isUserUniqueConstraintError(cause, 'email')) {
			return authError(400, 'Email is already used');
		}
		if (isUserUniqueConstraintError(cause, 'username')) {
			return authError(400, 'Username is already used');
		}
		logError('Failed to create auth user', cause);
		return authError(500, 'Unable to create account');
	}

	const verificationRequest = createEmailVerificationRequest(user.id, user.email);
	setEmailVerificationRequestCookie(event, verificationRequest);
	const flags: SessionFlags = { twoFactorVerified: false };
	createSessionAndSetCookie(event, user.id, flags);
	try {
		await sendVerificationEmail(verificationRequest.email, verificationRequest.code);
	} catch (cause) {
		logError('Failed to send signup verification email', cause);
		return authSuccess('verify-email', {
			message: 'Account created. Use “Send another code” to retry the verification email.'
		});
	}
	return authSuccess('verify-email');
}
