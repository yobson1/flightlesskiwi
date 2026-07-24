import { createSession, generateSessionToken, setSessionTokenCookie } from '$lib/server/auth';
import { authError, authSuccess } from '$lib/server/auth/api';
import { recoveryCodeBucket, resetUser2FAWithRecoveryCode } from '$lib/server/auth/2fa';
import {
	consumeLoginAttemptRequest,
	createLoginAttempt,
	invalidateLoginAttemptRequest,
	validateLoginAttemptRequest
} from '$lib/server/auth/login-attempt';
import { hashPassword, verifyPasswordHash } from '$lib/server/auth/password';
import { ExpiringTokenBucket } from '$lib/server/auth/rate-limit';
import { getClientIP } from '$lib/server/auth/routes';
import { totpBucket, verifyAndConsumeUserTOTP } from '$lib/server/auth/totp';
import {
	getUserById,
	getUserFromEmail,
	getUserPasswordHash,
	normalizeEmail,
	type AuthUser,
	verifyEmailInput
} from '$lib/server/auth/user';
import type { RequestEvent } from './$types';

const ipBucket = new ExpiringTokenBucket<string>('login-ip', 20, 10 * 60);
const accountBucket = new ExpiringTokenBucket<string>('login-account', 5, 15 * 60);

export async function POST(event: RequestEvent) {
	if (event.locals.session !== null) {
		return authError(409, 'Already authenticated');
	}
	invalidateLoginAttemptRequest(event);
	const clientIP = getClientIP(event);
	if (!ipBucket.check(clientIP, 1)) {
		return authError(429, 'Too many requests');
	}

	const formData = await event.request.formData();
	const rawEmail = formData.get('email');
	const password = formData.get('password');
	if (typeof rawEmail !== 'string' || typeof password !== 'string') {
		return authError(400, 'Invalid or missing fields');
	}
	const email = normalizeEmail(rawEmail);
	if (!verifyEmailInput(email) || password.length === 0 || password.length > 255) {
		return authError(400, 'Invalid email or password');
	}
	if (!ipBucket.consume(clientIP, 1) || !accountBucket.check(`${clientIP}:${email}`, 1)) {
		return authError(429, 'Too many requests');
	}

	const user = getUserFromEmail(email);
	if (user === null) {
		await hashPassword(password);
		accountBucket.consume(`${clientIP}:${email}`, 1);
		return authError(400, 'Invalid email or password');
	}
	if (!(await verifyPasswordHash(getUserPasswordHash(user.id), password))) {
		accountBucket.consume(`${clientIP}:${email}`, 1);
		return authError(400, 'Invalid email or password');
	}
	accountBucket.reset(`${clientIP}:${email}`);

	if (user.registeredTOTP) {
		createLoginAttempt(event, user.id);
		return authSuccess('login-totp');
	}
	if (user.registeredPasskey) {
		return authError(403, 'This account requires passkey sign-in');
	}
	return completeLogin(event, user);
}

export async function PUT(event: RequestEvent) {
	if (event.locals.session !== null) {
		return authError(409, 'Already authenticated');
	}
	const clientIP = getClientIP(event);
	if (!ipBucket.check(clientIP, 1)) {
		return authError(429, 'Too many requests');
	}
	const formData = await event.request.formData();
	const code = formData.get('code');
	if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
		return authError(400, 'Invalid or missing fields');
	}
	if (!ipBucket.consume(clientIP, 1)) {
		return authError(429, 'Too many requests');
	}

	const { attempt, user } = validateLoginAttemptRequest(event);
	if (attempt === null) {
		return authError(401, 'Sign-in attempt expired. Enter your password again.', {
			modal: 'login'
		});
	}
	if (!user.registeredTOTP) {
		invalidateLoginAttemptRequest(event);
		return authError(400, 'Authenticator is no longer available. Sign in again.', {
			modal: 'login'
		});
	}
	if (!totpBucket.consume(user.id, 1)) {
		return authError(429, 'Too many requests');
	}
	if (!verifyAndConsumeUserTOTP(user.id, code)) {
		return authError(400, 'Invalid authenticator code');
	}
	if (!consumeLoginAttemptRequest(event, attempt.id)) {
		return authError(401, 'Sign-in attempt expired. Enter your password again.', {
			modal: 'login'
		});
	}
	totpBucket.reset(user.id);
	return completeLogin(event, user);
}

export async function PATCH(event: RequestEvent) {
	if (event.locals.session !== null) {
		return authError(409, 'Already authenticated');
	}
	const clientIP = getClientIP(event);
	if (!ipBucket.check(clientIP, 1)) {
		return authError(429, 'Too many requests');
	}
	const formData = await event.request.formData();
	const code = formData.get('code');
	if (typeof code !== 'string' || code.trim().length === 0 || code.length > 64) {
		return authError(400, 'Invalid or missing fields');
	}
	if (!ipBucket.consume(clientIP, 1)) {
		return authError(429, 'Too many requests');
	}

	const { attempt, user } = validateLoginAttemptRequest(event);
	if (attempt === null) {
		return authError(401, 'Sign-in attempt expired. Enter your password again.', {
			modal: 'login'
		});
	}
	if (!user.registered2FA || !user.recoveryCodeConfigured) {
		return authError(400, 'Recovery code is not available. Sign in again.', { modal: 'login' });
	}
	if (!recoveryCodeBucket.consume(user.id, 1)) {
		return authError(429, 'Too many requests');
	}
	if (!(await resetUser2FAWithRecoveryCode(user.id, code))) {
		return authError(400, 'Invalid recovery code');
	}
	recoveryCodeBucket.reset(user.id);
	invalidateLoginAttemptRequest(event);

	const recoveredUser = getUserById(user.id);
	if (recoveredUser === null) {
		return authError(401, 'Account is no longer available.', { modal: 'login' });
	}
	return completeLogin(event, recoveredUser);
}

function completeLogin(event: RequestEvent, user: AuthUser): Response {
	const sessionToken = generateSessionToken();
	const session = createSession(sessionToken, user.id, { twoFactorVerified: true });
	setSessionTokenCookie(event, sessionToken, session.expiresAt);
	return authSuccess(!user.emailVerified ? 'verify-email' : !user.registeredTOTP ? 'setup' : null);
}
