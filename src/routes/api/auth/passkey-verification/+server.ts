import { setSessionAs2FAVerified } from '$lib/server/auth';
import {
	authError,
	authSuccess,
	requireAuthenticated,
	verifyPasskeyRequest
} from '$lib/server/auth/api';
import type { RequestEvent } from './$types';

export async function POST(event: RequestEvent) {
	const guarded = requireAuthenticated(event);
	if (guarded.response) return guarded.response;
	const { session, user } = guarded.authenticated;
	if (!user.emailVerified) {
		return authError(403, 'Verify your email first', { modal: 'verify-email' });
	}
	if (!user.registeredPasskey || session.twoFactorVerified) {
		return authError(403, 'Passkey verification is not available');
	}
	const verified = await verifyPasskeyRequest(event.request, user.id, 'passkey-2fa');
	if (verified.response) return verified.response;
	setSessionAs2FAVerified(session.id);
	return authSuccess(null);
}
