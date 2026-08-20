import { authError, authSuccess, getClientIP } from '#lib/server/auth/api.js';
import { parseRecoveryCode, verifyUserRecoveryCode } from '#lib/server/auth/2fa.js';
import {
	consumeLoginAttemptRequest,
	invalidateLoginAttemptRequest,
	validateLoginAttemptRequest
} from '#lib/server/auth/login-attempt.js';
import { completeLogin, completeLoginFirstFactor } from '#lib/server/auth/login.js';
import { hashPassword, parsePasswordInput, verifyPasswordHash } from '#lib/server/auth/password.js';
import { ExpiringTokenBucket, RefillingTokenBucket } from '#lib/server/auth/rate-limit.js';
import { parseTOTPCode, verifyUserTOTP } from '#lib/server/auth/totp.js';
import {
	getUserById,
	getUserFromEmail,
	getUserPasswordHash,
	normalizeEmail,
	verifyEmailInput
} from '#lib/server/auth/user.js';
import type { RequestEvent } from './$types';
import * as v from 'valibot';

const ipBucket = new ExpiringTokenBucket<string>('login-ip', 20, 10 * 60);
// Account failures must be shared across source IPs. Refilling one attempt at a time avoids
// leaving an idle account locked for a full fixed window after a burst of failed attempts.
const accountBucket = new RefillingTokenBucket<string>('login-account', 5, 3 * 60);

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
	const rawEmailResult = v.safeParse(v.string(), formData.get('email'));
	const password = parsePasswordInput(formData.get('password'));
	if (!rawEmailResult.success || password === null) {
		return authError(400, 'Invalid or missing fields');
	}
	const email = normalizeEmail(rawEmailResult.output);
	if (!verifyEmailInput(email)) {
		return authError(400, 'Invalid email or password');
	}
	if (!ipBucket.consume(clientIP, 1) || !accountBucket.check(email, 1)) {
		return authError(429, 'Too many requests');
	}

	const user = getUserFromEmail(email);
	if (user === null) {
		await hashPassword(password);
		accountBucket.consume(email, 1);
		return authError(400, 'Invalid email or password');
	}
	const passwordHash = getUserPasswordHash(user.id);
	if (passwordHash === null || !(await verifyPasswordHash(passwordHash, password))) {
		if (passwordHash === null) await hashPassword(password);
		accountBucket.consume(email, 1);
		return authError(400, 'Invalid email or password');
	}
	accountBucket.reset(email);

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
	const code = parseTOTPCode(formData.get('code'));
	if (code === null) {
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
	const code = parseRecoveryCode(formData.get('code'));
	if (code === null) {
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
