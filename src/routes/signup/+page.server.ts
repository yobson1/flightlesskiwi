import { fail, redirect } from '@sveltejs/kit';
import { error as logError } from '$lib/logger';
import {
	createSession,
	generateSessionToken,
	setSessionTokenCookie,
	type SessionFlags
} from '$lib/server/auth';
import {
	createEmailVerificationRequest,
	setEmailVerificationRequestCookie
} from '$lib/server/auth/email-verification';
import { sendVerificationEmail } from '$lib/server/auth/email';
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
import { getAuthenticatedRedirect, getClientIP } from '$lib/server/auth/routes';
import type { Actions, PageServerLoadEvent, RequestEvent } from './$types';

const ipBucket = new RefillingTokenBucket<string>('signup-ip', 3, 10);

export function load(event: PageServerLoadEvent) {
	const destination = getAuthenticatedRedirect(event);
	if (destination !== null) {
		redirect(302, destination);
	}
	return {};
}

export const actions: Actions = {
	default: signup
};

async function signup(event: RequestEvent) {
	const clientIP = getClientIP(event);
	if (!ipBucket.check(clientIP, 1)) {
		return fail(429, { message: 'Too many requests', email: '', username: '' });
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
		return fail(400, {
			message: 'Invalid or missing fields',
			email: '',
			username: ''
		});
	}
	const email = normalizeEmail(rawEmail);
	if (!verifyEmailInput(email)) {
		return fail(400, { message: 'Invalid email', email, username });
	}
	if (!verifyUsernameInput(username)) {
		return fail(400, { message: 'Invalid username', email, username });
	}
	if (!verifyPasswordStrength(password)) {
		return fail(400, {
			message: 'Password must be between 12 and 255 characters',
			email,
			username
		});
	}
	if (!ipBucket.consume(clientIP, 1)) {
		return fail(429, { message: 'Too many requests', email, username });
	}
	if (!checkEmailAvailability(email)) {
		return fail(400, { message: 'Email is already used', email, username });
	}
	if (!checkUsernameAvailability(username)) {
		return fail(400, { message: 'Username is already used', email, username });
	}

	let user;
	try {
		user = await createUser(email, username, password);
	} catch (cause) {
		if (isUserUniqueConstraintError(cause, 'email')) {
			return fail(400, { message: 'Email is already used', email, username });
		}
		if (isUserUniqueConstraintError(cause, 'username')) {
			return fail(400, { message: 'Username is already used', email, username });
		}
		logError('Failed to create auth user', cause);
		return fail(500, { message: 'Unable to create account', email, username });
	}

	const verificationRequest = createEmailVerificationRequest(user.id, user.email);
	setEmailVerificationRequestCookie(event, verificationRequest);
	const sessionToken = generateSessionToken();
	const flags: SessionFlags = { twoFactorVerified: false };
	const session = createSession(sessionToken, user.id, flags);
	setSessionTokenCookie(event, sessionToken, session.expiresAt);

	try {
		await sendVerificationEmail(verificationRequest.email, verificationRequest.code);
	} catch (cause) {
		logError('Failed to send signup verification email', cause);
		return fail(503, {
			message:
				'Account created, but the verification email could not be sent. Try resending it from the verification page.',
			email,
			username
		});
	}
	redirect(302, '/verify-email');
}
