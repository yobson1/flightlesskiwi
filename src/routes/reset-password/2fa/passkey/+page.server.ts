import { redirect } from '@sveltejs/kit';
import { validatePasswordResetSessionRequest } from '$lib/server/auth/password-reset';
import { getUserPasskeyCredentials } from '$lib/server/auth/webauthn';
import type { RequestEvent } from './$types';

export function load(event: RequestEvent) {
	const { session, user } = validatePasswordResetSessionRequest(event);
	if (session === null) {
		redirect(302, '/forgot-password');
	}
	if (!session.emailVerified) {
		redirect(302, '/reset-password/verify-email');
	}
	if (!user.registeredPasskey || session.twoFactorVerified) {
		redirect(302, '/reset-password');
	}
	return { credentials: getUserPasskeyCredentials(user.id) };
}
