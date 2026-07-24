import { setSessionAs2FAVerified } from '$lib/server/auth';
import { authError, authSuccess, requireAuthenticated } from '$lib/server/auth/api';
import { recoveryCodeBucket, resetUser2FAWithRecoveryCode } from '$lib/server/auth/2fa';
import { createSession, generateSessionToken, setSessionTokenCookie } from '$lib/server/auth';
import { totpBucket, verifyAndConsumeUserTOTP } from '$lib/server/auth/totp';
import type { RequestEvent } from './$types';

export async function POST(event: RequestEvent) {
	const guarded = requireAuthenticated(event);
	if (guarded.response) return guarded.response;
	const { session, user } = guarded.authenticated;
	if (!user.emailVerified) {
		return authError(403, 'Verify your email first', { modal: 'verify-email' });
	}
	if (!user.registeredTOTP || session.twoFactorVerified) {
		return authError(403, 'Authenticator verification is not available');
	}
	const formData = await event.request.formData();
	const code = formData.get('code');
	if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
		return authError(400, 'Enter the six-digit code');
	}
	if (!totpBucket.consume(user.id, 1)) return authError(429, 'Too many requests');
	if (!verifyAndConsumeUserTOTP(user.id, code)) return authError(400, 'Invalid code');
	totpBucket.reset(user.id);
	setSessionAs2FAVerified(session.id);
	return authSuccess(null);
}

export async function PATCH(event: RequestEvent) {
	const guarded = requireAuthenticated(event);
	if (guarded.response) return guarded.response;
	const { session, user } = guarded.authenticated;
	if (!user.emailVerified) {
		return authError(403, 'Verify your email first', { modal: 'verify-email' });
	}
	if (!user.registered2FA || session.twoFactorVerified) {
		return authError(403, 'Account recovery is not available');
	}
	const formData = await event.request.formData();
	const code = formData.get('code');
	if (typeof code !== 'string' || code.length === 0) {
		return authError(400, 'Enter your recovery code');
	}
	if (
		!recoveryCodeBucket.consume(user.id, 1) ||
		!(await resetUser2FAWithRecoveryCode(user.id, code))
	) {
		return authError(400, 'Invalid recovery code');
	}
	recoveryCodeBucket.reset(user.id);
	const sessionToken = generateSessionToken();
	const newSession = createSession(sessionToken, user.id, { twoFactorVerified: true });
	setSessionTokenCookie(event, sessionToken, newSession.expiresAt);
	return authSuccess('setup');
}
