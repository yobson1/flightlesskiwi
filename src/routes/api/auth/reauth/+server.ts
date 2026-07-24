import { TOTP_CODE_LENGTH_WORD } from '$lib/auth-constants';
import { rotateSessionAfterReauthentication } from '$lib/server/auth';
import { authError, authSuccess, requireVerifiedSession } from '$lib/server/auth/api';
import { isPasswordInput, verifyPasswordHash } from '$lib/server/auth/password';
import { ExpiringTokenBucket } from '$lib/server/auth/rate-limit';
import { isTOTPCode, verifyUserTOTP } from '$lib/server/auth/totp';
import { getUserPasswordHash } from '$lib/server/auth/user';
import type { RequestEvent } from './$types';

const reauthenticationBucket = new ExpiringTokenBucket<string>('settings-reauth', 5, 15 * 60);

export async function POST(event: RequestEvent) {
	const guarded = requireVerifiedSession(event);
	if (guarded.response) return guarded.response;
	const { session, user } = guarded.authenticated;
	if (user.registeredTOTP || user.registeredPasskey) {
		return authError(403, 'Password reauthentication is not available');
	}
	const formData = await event.request.formData();
	const password = formData.get('password');
	if (!isPasswordInput(password)) {
		return authError(400, 'Enter your password');
	}
	if (!reauthenticationBucket.consume(session.id, 1)) {
		return authError(429, 'Too many requests');
	}
	if (!(await verifyPasswordHash(getUserPasswordHash(user.id), password))) {
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
	const code = formData.get('code');
	if (!isTOTPCode(code)) {
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
