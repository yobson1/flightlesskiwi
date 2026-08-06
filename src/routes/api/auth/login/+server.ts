import { authError, authSuccess, getClientIP } from '$lib/server/auth/api';
import { isRecoveryCode, verifyUserRecoveryCode } from '$lib/server/auth/2fa';
import {
	consumeLoginAttemptRequest,
	invalidateLoginAttemptRequest,
	validateLoginAttemptRequest
} from '$lib/server/auth/login-attempt';
import { completeLogin, completeLoginFirstFactor } from '$lib/server/auth/login';
import { hashPassword, isPasswordInput, verifyPasswordHash } from '$lib/server/auth/password';
import { ExpiringTokenBucket } from '$lib/server/auth/rate-limit';
import { isTOTPCode, verifyUserTOTP } from '$lib/server/auth/totp';
import {
	getUserById,
	getUserFromEmail,
	getUserPasswordHash,
	normalizeEmail,
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
	if (!verifyEmailInput(email) || !isPasswordInput(password)) {
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
	const passwordHash = getUserPasswordHash(user.id);
	if (passwordHash === null || !(await verifyPasswordHash(passwordHash, password))) {
		if (passwordHash === null) await hashPassword(password);
		accountBucket.consume(`${clientIP}:${email}`, 1);
		return authError(400, 'Invalid email or password');
	}
	accountBucket.reset(`${clientIP}:${email}`);

	return authSuccess(completeLoginFirstFactor(event, user));
}

export function GET(event: RequestEvent) {
	if (event.locals.session !== null) return authError(409, 'Already authenticated');
	const { attempt, user } = validateLoginAttemptRequest(event);
	if (attempt === null) {
		return authError(401, 'Sign-in attempt expired. Sign in again.', { modal: 'login' });
	}
	return authSuccess('login-2fa', {
		registeredTOTP: user.registeredTOTP,
		registeredPasskey: user.registeredPasskey
	});
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
	if (!isTOTPCode(code)) {
		return authError(400, 'Invalid or missing fields');
	}
	if (!ipBucket.consume(clientIP, 1)) {
		return authError(429, 'Too many requests');
	}

	const { attempt, user } = validateLoginAttemptRequest(event);
	if (attempt === null) {
		return authError(401, 'Sign-in attempt expired. Sign in again.', {
			modal: 'login'
		});
	}
	if (!user.registeredTOTP) {
		invalidateLoginAttemptRequest(event);
		return authError(400, 'Authenticator is no longer available. Sign in again.', {
			modal: 'login'
		});
	}
	const verification = verifyUserTOTP(user.id, code);
	if (verification === 'rate-limited') {
		return authError(429, 'Too many requests');
	}
	if (verification === 'invalid') {
		return authError(400, 'Invalid authenticator code');
	}
	if (!consumeLoginAttemptRequest(event, attempt.id)) {
		return authError(401, 'Sign-in attempt expired. Sign in again.', {
			modal: 'login'
		});
	}
	return authSuccess(completeLogin(event, user));
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
	if (!isRecoveryCode(code)) {
		return authError(400, 'Invalid or missing fields');
	}
	if (!ipBucket.consume(clientIP, 1)) {
		return authError(429, 'Too many requests');
	}

	const { attempt, user } = validateLoginAttemptRequest(event);
	if (attempt === null) {
		return authError(401, 'Sign-in attempt expired. Sign in again.', {
			modal: 'login'
		});
	}
	if (!user.registered2FA || !user.recoveryCodeConfigured) {
		return authError(400, 'Recovery code is not available. Sign in again.', { modal: 'login' });
	}
	const verification = await verifyUserRecoveryCode(user.id, code);
	if (verification === 'rate-limited') {
		return authError(429, 'Too many requests');
	}
	if (verification === 'invalid') {
		return authError(400, 'Invalid recovery code');
	}
	invalidateLoginAttemptRequest(event);

	const recoveredUser = getUserById(user.id);
	if (recoveredUser === null) {
		return authError(401, 'Account is no longer available.', { modal: 'login' });
	}
	return authSuccess(completeLogin(event, recoveredUser));
}
