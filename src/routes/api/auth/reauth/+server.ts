import { TOTP_CODE_LENGTH_WORD } from '#lib/auth-constants.js';
import { rotateSessionAfterReauthentication } from '#lib/server/auth.js';
import { authError, authSuccess, requireVerifiedSession } from '#lib/server/auth/api.js';
import { parsePasswordInput, verifyPasswordHash } from '#lib/server/auth/password.js';
import { ExpiringTokenBucket } from '#lib/server/auth/rate-limit.js';
import { parseTOTPCode, verifyUserTOTP } from '#lib/server/auth/totp.js';
import { getUserPasswordHash } from '#lib/server/auth/user.js';
import type { RequestEvent } from './$types';

const reauthenticationBucket = new ExpiringTokenBucket<string>('settings-reauth', 5, 15 * 60);

export async function POST(event: RequestEvent) {
	const guarded = requireVerifiedSession(event);
	if (guarded.response) return guarded.response;
	const { session, user } = guarded.authenticated;
	if (user.registeredTOTP || user.registeredPasskey || !user.hasPassword) {
		return authError(403, 'Password reauthentication is not available');
	}
	const formData = await event.request.formData();
	const password = parsePasswordInput(formData.get('password'));
	if (password === null) {
		return authError(400, 'Enter your password');
	}
	if (!reauthenticationBucket.consume(session.id, 1)) {
		return authError(429, 'Too many requests');
	}
	const passwordHash = getUserPasswordHash(user.id);
	if (passwordHash === null || !(await verifyPasswordHash(passwordHash, password))) {
		return authError(400, 'Incorrect password');
	}
	reauthenticationBucket.reset(session.id);
	rotateSessionAfterReauthentication(event, session);
	return authSuccess(null);
}

export async function PUT(event: RequestEvent) {
	const guarded = requireVerifiedSession(event);
	if (guarded.response) return guarded.response;
	const { session, user } = guarded.authenticated;
	if (!user.registeredTOTP) {
		return authError(403, 'Authenticator reauthentication is not available');
	}
	const formData = await event.request.formData();
	const code = parseTOTPCode(formData.get('code'));
	if (code === null) {
		return authError(400, `Enter the ${TOTP_CODE_LENGTH_WORD}-digit code`);
	}
	if (!reauthenticationBucket.consume(session.id, 1)) {
		return authError(429, 'Too many requests');
	}
	const verification = verifyUserTOTP(user.id, code);
	if (verification === 'rate-limited') return authError(429, 'Too many requests');
	if (verification === 'invalid') {
		return authError(400, 'Invalid authenticator code');
	}
	reauthenticationBucket.reset(session.id);
	rotateSessionAfterReauthentication(event, session);
	return authSuccess(null);
}
