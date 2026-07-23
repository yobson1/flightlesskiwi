import { fail, redirect } from '@sveltejs/kit';
import { recoveryCodeBucket, resetUser2FAWithRecoveryCode } from '$lib/server/auth/2fa';
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
	return {};
}

export const actions: Actions = {
	default: reset2FA
};

async function reset2FA(event: RequestEvent) {
	if (event.locals.session === null || event.locals.user === null) {
		return fail(401, { message: 'Not authenticated' });
	}
	if (
		!event.locals.user.emailVerified ||
		!event.locals.user.registered2FA ||
		event.locals.session.twoFactorVerified
	) {
		return fail(403, { message: 'Forbidden' });
	}
	const formData = await event.request.formData();
	const code = formData.get('code');
	if (typeof code !== 'string' || code.length === 0) {
		return fail(400, { message: 'Enter your recovery code' });
	}
	if (
		!recoveryCodeBucket.consume(event.locals.user.id, 1) ||
		!resetUser2FAWithRecoveryCode(event.locals.user.id, code)
	) {
		return fail(400, { message: 'Invalid recovery code' });
	}
	recoveryCodeBucket.reset(event.locals.user.id);
	redirect(302, '/2fa/setup');
}
