import { createSessionAndSetCookie, setSessionAs2FAVerified } from '$lib/server/auth';
import { authError, authSuccess, requireAuthenticated } from '$lib/server/auth/api';
import { isRecoveryCode, verifyUserRecoveryCode } from '$lib/server/auth/2fa';
import { isTOTPCode, verifyUserTOTP } from '$lib/server/auth/totp';
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
	if (!isTOTPCode(code)) {
		return authError(400, 'Enter the six-digit code');
	}
	const verification = verifyUserTOTP(user.id, code);
	if (verification === 'rate-limited') return authError(429, 'Too many requests');
	if (verification === 'invalid') return authError(400, 'Invalid code');
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
	if (!isRecoveryCode(code)) {
		return authError(400, 'Enter your recovery code');
	}
	const verification = await verifyUserRecoveryCode(user.id, code);
	if (verification === 'rate-limited') return authError(429, 'Too many requests');
	if (verification === 'invalid') return authError(400, 'Invalid recovery code');
	createSessionAndSetCookie(event, user.id, { twoFactorVerified: true });
	return authSuccess('setup');
}
