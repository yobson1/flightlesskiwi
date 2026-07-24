import { WEBAUTHN_RP_NAME } from '$env/static/private';
import { createTOTPKeyURI } from '@oslojs/otp';
import { rotateSessionAfter2FAEnrollment } from '$lib/server/auth';
import { authError, authSuccess, requireVerifiedSession } from '$lib/server/auth/api';
import {
	deleteTOTPSetupCookie,
	generateTOTPKey,
	getTOTPSetupKey,
	setTOTPSetupCookie,
	totpUpdateBucket,
	updateUserTOTPKey,
	verifyTOTPKey
} from '$lib/server/auth/totp';
import type { RequestEvent } from './$types';

export function POST(event: RequestEvent) {
	event.setHeaders({ 'cache-control': 'no-store' });
	const guarded = requireVerifiedSession(event, { recentlyReauthenticated: true });
	if (guarded.response) return guarded.response;
	const { user } = guarded.authenticated;
	if (user.registeredTOTP) return authError(400, 'An authenticator is already configured');
	if (!totpUpdateBucket.check(user.id, 1)) return authError(429, 'Too many requests');

	const key = generateTOTPKey();
	setTOTPSetupCookie(event, user.id, key);
	return authSuccess('totp-setup', {
		keyURI: createTOTPKeyURI(WEBAUTHN_RP_NAME, user.email, key, 30, 6)
	});
}

export async function PUT(event: RequestEvent) {
	const guarded = requireVerifiedSession(event, { recentlyReauthenticated: true });
	if (guarded.response) return guarded.response;
	const { session, user } = guarded.authenticated;
	if (!totpUpdateBucket.check(user.id, 1)) return authError(429, 'Too many requests');
	const formData = await event.request.formData();
	const code = formData.get('code');
	if (typeof code !== 'string' || code.length === 0) return authError(400, 'Enter your code');
	const key = getTOTPSetupKey(event, user.id);
	if (key === null) return authError(400, 'Authenticator setup expired; reload and try again');
	if (!totpUpdateBucket.consume(user.id, 1)) return authError(429, 'Too many requests');
	const counter = verifyTOTPKey(key, code);
	if (counter === null) return authError(400, 'Invalid code');
	totpUpdateBucket.reset(user.id);
	updateUserTOTPKey(user.id, key, counter);
	if (!user.registered2FA) rotateSessionAfter2FAEnrollment(event, session);
	deleteTOTPSetupCookie(event);
	return authSuccess(user.registeredTOTP ? null : 'recovery-code');
}
