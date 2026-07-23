import { fail, redirect } from '@sveltejs/kit';
import { createSession, generateSessionToken, setSessionTokenCookie } from '$lib/server/auth';
import { recoveryCodeBucket, resetUser2FAWithRecoveryCode } from '$lib/server/auth/2fa';
import {
	consumeLoginAttemptRequest,
	createLoginAttempt,
	invalidateLoginAttemptRequest,
	validateLoginAttemptRequest
} from '$lib/server/auth/login-attempt';
import { hashPassword, verifyPasswordHash } from '$lib/server/auth/password';
import { ExpiringTokenBucket } from '$lib/server/auth/rate-limit';
import { getAuthenticatedRedirect, getClientIP } from '$lib/server/auth/routes';
import { totpBucket, verifyAndConsumeUserTOTP } from '$lib/server/auth/totp';
import {
	getUserFromEmail,
	getUserById,
	getUserPasswordHash,
	normalizeEmail,
	type AuthUser,
	verifyEmailInput
} from '$lib/server/auth/user';
import type { Actions, PageServerLoadEvent, RequestEvent } from './$types';

const ipBucket = new ExpiringTokenBucket<string>('login-ip', 20, 10 * 60);
const accountBucket = new ExpiringTokenBucket<string>('login-account', 5, 15 * 60);

export function load(event: PageServerLoadEvent) {
	const destination = getAuthenticatedRedirect(event);
	if (destination !== null) {
		redirect(302, destination);
	}
	return {};
}

export const actions: Actions = {
	password: login,
	totp: loginWithTOTP,
	recovery: loginWithRecoveryCode
};

async function login(event: RequestEvent) {
	if (event.locals.session !== null) {
		return fail(409, { message: 'Already authenticated', email: '' });
	}
	invalidateLoginAttemptRequest(event);
	const clientIP = getClientIP(event);
	if (!ipBucket.check(clientIP, 1)) {
		return fail(429, { message: 'Too many requests', email: '' });
	}

	const formData = await event.request.formData();
	const rawEmail = formData.get('email');
	const password = formData.get('password');
	if (typeof rawEmail !== 'string' || typeof password !== 'string') {
		return fail(400, { message: 'Invalid or missing fields', email: '' });
	}
	const email = normalizeEmail(rawEmail);
	if (!verifyEmailInput(email) || password.length === 0 || password.length > 255) {
		return fail(400, { message: 'Invalid email or password', email });
	}
	if (!ipBucket.consume(clientIP, 1) || !accountBucket.check(`${clientIP}:${email}`, 1)) {
		return fail(429, { message: 'Too many requests', email });
	}

	const user = getUserFromEmail(email);
	if (user === null) {
		// Keep unknown-account requests close to the cost of a real Argon2id verify.
		await hashPassword(password);
		accountBucket.consume(`${clientIP}:${email}`, 1);
		return fail(400, { message: 'Invalid email or password', email });
	}
	const validPassword = await verifyPasswordHash(getUserPasswordHash(user.id), password);
	if (!validPassword) {
		accountBucket.consume(`${clientIP}:${email}`, 1);
		return fail(400, { message: 'Invalid email or password', email });
	}
	accountBucket.reset(`${clientIP}:${email}`);

	if (user.registeredTOTP) {
		createLoginAttempt(event, user.id);
		return { requiresTOTP: true };
	}
	if (user.registeredPasskey) {
		return fail(403, {
			message: 'This account requires passkey sign-in',
			email
		});
	}
	completeLogin(event, user);
}

async function loginWithTOTP(event: RequestEvent) {
	if (event.locals.session !== null) {
		return fail(409, { message: 'Already authenticated' });
	}
	const clientIP = getClientIP(event);
	if (!ipBucket.check(clientIP, 1)) {
		return fail(429, { message: 'Too many requests' });
	}

	const formData = await event.request.formData();
	const code = formData.get('code');
	if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
		return fail(400, { message: 'Invalid or missing fields' });
	}
	if (!ipBucket.consume(clientIP, 1)) {
		return fail(429, { message: 'Too many requests' });
	}

	const { attempt, user } = validateLoginAttemptRequest(event);
	if (attempt === null) {
		return fail(401, { message: 'Sign-in attempt expired. Enter your password again.' });
	}
	if (!user.registeredTOTP) {
		invalidateLoginAttemptRequest(event);
		return fail(400, { message: 'Authenticator is no longer available. Sign in again.' });
	}
	if (!totpBucket.consume(user.id, 1)) {
		return fail(429, { message: 'Too many requests' });
	}
	if (!verifyAndConsumeUserTOTP(user.id, code)) {
		return fail(400, { message: 'Invalid authenticator code' });
	}
	if (!consumeLoginAttemptRequest(event, attempt.id)) {
		return fail(401, { message: 'Sign-in attempt expired. Enter your password again.' });
	}
	totpBucket.reset(user.id);
	completeLogin(event, user);
}

async function loginWithRecoveryCode(event: RequestEvent) {
	if (event.locals.session !== null) {
		return fail(409, { message: 'Already authenticated' });
	}
	const clientIP = getClientIP(event);
	if (!ipBucket.check(clientIP, 1)) {
		return fail(429, { message: 'Too many requests' });
	}

	const formData = await event.request.formData();
	const code = formData.get('code');
	if (typeof code !== 'string' || code.trim().length === 0 || code.length > 64) {
		return fail(400, { message: 'Invalid or missing fields' });
	}
	if (!ipBucket.consume(clientIP, 1)) {
		return fail(429, { message: 'Too many requests' });
	}

	const { attempt, user } = validateLoginAttemptRequest(event);
	if (attempt === null) {
		return fail(401, { message: 'Sign-in attempt expired. Enter your password again.' });
	}
	if (!user.registered2FA || !user.recoveryCodeConfigured) {
		return fail(400, { message: 'Recovery code is not available. Sign in again.' });
	}
	if (!recoveryCodeBucket.consume(user.id, 1)) {
		return fail(429, { message: 'Too many requests' });
	}
	if (!(await resetUser2FAWithRecoveryCode(user.id, code))) {
		return fail(400, { message: 'Invalid recovery code' });
	}
	recoveryCodeBucket.reset(user.id);
	invalidateLoginAttemptRequest(event);

	const recoveredUser = getUserById(user.id);
	if (recoveredUser === null) {
		return fail(401, { message: 'Account is no longer available.' });
	}
	completeLogin(event, recoveredUser);
}

function completeLogin(event: RequestEvent, user: AuthUser): never {
	const sessionToken = generateSessionToken();
	const session = createSession(sessionToken, user.id, { twoFactorVerified: true });
	setSessionTokenCookie(event, sessionToken, session.expiresAt);

	if (!user.emailVerified) {
		redirect(302, '/verify-email');
	}
	if (!user.registeredTOTP) {
		redirect(302, '/2fa/setup');
	}
	redirect(302, '/');
}
