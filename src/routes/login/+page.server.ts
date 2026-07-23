import { fail, redirect } from '@sveltejs/kit';
import {
	createSession,
	generateSessionToken,
	setSessionTokenCookie,
	type SessionFlags
} from '$lib/server/auth';
import { get2FARedirect } from '$lib/server/auth/2fa';
import { hashPassword, verifyPasswordHash } from '$lib/server/auth/password';
import { ExpiringTokenBucket } from '$lib/server/auth/rate-limit';
import { getAuthenticatedRedirect, getClientIP } from '$lib/server/auth/routes';
import {
	getUserFromEmail,
	getUserPasswordHash,
	normalizeEmail,
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
	default: login
};

async function login(event: RequestEvent) {
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

	const flags: SessionFlags = { twoFactorVerified: !user.registered2FA };
	const sessionToken = generateSessionToken();
	const session = createSession(sessionToken, user.id, flags);
	setSessionTokenCookie(event, sessionToken, session.expiresAt);

	if (!user.emailVerified) {
		redirect(302, '/verify-email');
	}
	if (!user.registered2FA) {
		redirect(302, '/2fa/setup');
	}
	redirect(302, get2FARedirect(user));
}
