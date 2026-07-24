import { createSessionAndSetCookie } from '$lib/server/auth';
import { authError, authSuccess, getClientIP, verifyPasskeyRequest } from '$lib/server/auth/api';
import { invalidateLoginAttemptRequest } from '$lib/server/auth/login-attempt';
import { ExpiringTokenBucket } from '$lib/server/auth/rate-limit';
import { getUserById } from '$lib/server/auth/user';
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
	createSessionAndSetCookie(event, user.id, { twoFactorVerified: true });
	return authSuccess(user.emailVerified ? null : 'verify-email');
}
