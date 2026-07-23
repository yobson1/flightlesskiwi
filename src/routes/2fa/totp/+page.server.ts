import { fail, redirect } from '@sveltejs/kit';
import { setSessionAs2FAVerified } from '$lib/server/auth';
import { totpBucket, verifyAndConsumeUserTOTP } from '$lib/server/auth/totp';
import type { Actions, RequestEvent } from './$types';

export function load(event: RequestEvent) {
	if (event.locals.session === null || event.locals.user === null) {
		redirect(302, '/login');
	}
	if (!event.locals.user.emailVerified) {
		redirect(302, '/verify-email');
	}
	if (!event.locals.user.registered2FA) {
		redirect(302, '/2fa/setup');
	}
	if (event.locals.session.twoFactorVerified) {
		redirect(302, '/');
	}
	if (!event.locals.user.registeredTOTP) {
		redirect(302, '/2fa');
	}
	return { user: event.locals.user };
}

export const actions: Actions = {
	default: verifyCode
};

async function verifyCode(event: RequestEvent) {
	if (event.locals.session === null || event.locals.user === null) {
		return fail(401, { message: 'Not authenticated' });
	}
	if (
		!event.locals.user.emailVerified ||
		!event.locals.user.registeredTOTP ||
		event.locals.session.twoFactorVerified
	) {
		return fail(403, { message: 'Forbidden' });
	}
	const formData = await event.request.formData();
	const code = formData.get('code');
	if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
		return fail(400, { message: 'Enter your code' });
	}
	if (!totpBucket.consume(event.locals.user.id, 1)) {
		return fail(429, { message: 'Too many requests' });
	}
	if (!verifyAndConsumeUserTOTP(event.locals.user.id, code)) {
		return fail(400, { message: 'Invalid code' });
	}
	totpBucket.reset(event.locals.user.id);
	setSessionAs2FAVerified(event.locals.session.id);
	redirect(302, '/');
}
