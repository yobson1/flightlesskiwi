import { WEBAUTHN_RP_NAME } from '$env/static/private';
import { createTOTPKeyURI } from '@oslojs/otp';
import { encodeBase64 } from '@oslojs/encoding';
import { fail, redirect } from '@sveltejs/kit';
import {
	isSessionRecentlyReauthenticated,
	rotateSessionAfter2FAEnrollment
} from '$lib/server/auth';
import { get2FARedirect } from '$lib/server/auth/2fa';
import {
	deleteTOTPSetupCookie,
	generateTOTPKey,
	getTOTPSetupKey,
	setTOTPSetupCookie,
	totpUpdateBucket,
	updateUserTOTPKey,
	verifyTOTPKey
} from '$lib/server/auth/totp';
import type { Actions, RequestEvent } from './$types';

export function load(event: RequestEvent) {
	if (event.locals.session === null || event.locals.user === null) {
		redirect(302, '/login');
	}
	if (!event.locals.user.emailVerified) {
		redirect(302, '/verify-email');
	}
	if (event.locals.user.registered2FA && !event.locals.session.twoFactorVerified) {
		redirect(302, get2FARedirect(event.locals.user));
	}
	if (!isSessionRecentlyReauthenticated(event.locals.session)) {
		redirect(302, '/settings?next=/2fa/totp/setup');
	}
	const key = generateTOTPKey();
	setTOTPSetupCookie(event, event.locals.user.id, key);
	return {
		encodedTOTPKey: encodeBase64(key),
		keyURI: createTOTPKeyURI(WEBAUTHN_RP_NAME, event.locals.user.email, key, 30, 6)
	};
}

export const actions: Actions = {
	default: setupTOTP
};

async function setupTOTP(event: RequestEvent) {
	if (event.locals.session === null || event.locals.user === null) {
		return fail(401, { message: 'Not authenticated' });
	}
	if (
		!event.locals.user.emailVerified ||
		(event.locals.user.registered2FA && !event.locals.session.twoFactorVerified)
	) {
		return fail(403, { message: 'Forbidden' });
	}
	if (!isSessionRecentlyReauthenticated(event.locals.session)) {
		return fail(428, { message: 'Confirm your identity before adding an authenticator' });
	}
	if (!totpUpdateBucket.check(event.locals.user.id, 1)) {
		return fail(429, { message: 'Too many requests' });
	}
	const formData = await event.request.formData();
	const code = formData.get('code');
	if (typeof code !== 'string' || code.length === 0) {
		return fail(400, { message: 'Enter your code' });
	}
	const key = getTOTPSetupKey(event, event.locals.user.id);
	if (key === null) {
		return fail(400, { message: 'TOTP setup expired; reload and try again' });
	}
	if (!totpUpdateBucket.consume(event.locals.user.id, 1)) {
		return fail(429, { message: 'Too many requests' });
	}
	const counter = verifyTOTPKey(key, code);
	if (counter === null) {
		return fail(400, { message: 'Invalid code' });
	}
	totpUpdateBucket.reset(event.locals.user.id);
	updateUserTOTPKey(event.locals.user.id, key, counter);
	if (!event.locals.user.registered2FA) {
		rotateSessionAfter2FAEnrollment(event, event.locals.session);
	}
	deleteTOTPSetupCookie(event);
	if (!event.locals.user.registeredTOTP) {
		redirect(302, '/recovery-code');
	}
	redirect(302, '/');
}
