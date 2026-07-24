import { authError, authSuccess, verifyPasskeyRequest } from '$lib/server/auth/api';
import {
	getPasswordResetState,
	setPasswordResetSessionAs2FAVerified,
	validatePasswordResetSessionRequest
} from '$lib/server/auth/password-reset';
import type { RequestEvent } from './$types';

export async function POST(event: RequestEvent) {
	if (event.locals.session !== null) {
		return authError(409, 'You are already signed in');
	}
	const { session, user } = validatePasswordResetSessionRequest(event);
	if (
		session === null ||
		!session.emailVerified ||
		session.twoFactorVerified ||
		!user.registeredPasskey
	) {
		return authError(403, 'Passkey verification is not available');
	}
	const verified = await verifyPasskeyRequest(event.request, user.id, 'password-reset-2fa');
	if (verified.response) return verified.response;
	setPasswordResetSessionAs2FAVerified(session.id);
	return authSuccess(
		'password-reset',
		getPasswordResetState({ ...session, twoFactorVerified: true }, user)
	);
}
