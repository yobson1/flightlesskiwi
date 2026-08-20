import { createSessionAndSetCookie } from '#lib/server/auth.js';
import { authError, authSuccess, getClientIP, verifyPasskeyRequest } from '#lib/server/auth/api.js';
import { completeLogin } from '#lib/server/auth/login.js';
import {
	consumeLoginAttemptRequest,
	invalidateLoginAttemptRequest,
	validateLoginAttemptRequest
} from '#lib/server/auth/login-attempt.js';
import { ExpiringTokenBucket } from '#lib/server/auth/rate-limit.js';
import { getUserById } from '#lib/server/auth/user.js';
import type { RequestEvent } from './$types';

const assertionBucket = new ExpiringTokenBucket<string>('passkey-login-ip', 10, 10 * 60);

export async function POST(event: RequestEvent) {
	if (event.locals.session !== null) {
		return authError(409, 'Already authenticated');
	}
	if (!assertionBucket.consume(getClientIP(event), 1)) {
		return authError(429, 'Too many requests');
	}
	const verified = await verifyPasskeyRequest(event.request, null, 'passkey-login');
	if (verified.response) return verified.response;
	const { credential } = verified;
	const user = getUserById(credential.userId);
	if (user === null) {
		return authError(400, 'Invalid credential');
	}
	invalidateLoginAttemptRequest(event);
	createSessionAndSetCookie(event, user.id);
	return authSuccess(user.emailVerified ? null : 'verify-email');
}

export async function PUT(event: RequestEvent) {
	if (event.locals.session !== null) return authError(409, 'Already authenticated');
	if (!assertionBucket.consume(getClientIP(event), 1)) {
		return authError(429, 'Too many requests');
	}
	const { attempt, user } = validateLoginAttemptRequest(event);
	if (attempt === null) {
		return authError(401, 'Sign-in attempt expired. Sign in again.', { modal: 'login' });
	}
	if (!user.registeredPasskey) {
		invalidateLoginAttemptRequest(event);
		return authError(400, 'Passkey is no longer available. Sign in again.', { modal: 'login' });
	}
	const verified = await verifyPasskeyRequest(event.request, user.id, 'passkey-2fa');
	if (verified.response) return verified.response;
	if (!consumeLoginAttemptRequest(event, attempt.id)) {
		return authError(401, 'Sign-in attempt expired. Sign in again.', { modal: 'login' });
	}
	return authSuccess(completeLogin(event, user));
}
