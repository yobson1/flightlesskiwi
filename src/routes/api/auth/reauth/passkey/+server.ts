import { rotateSessionAfterReauthentication } from '$lib/server/auth';
import {
	authError,
	authSuccess,
	requireVerifiedSession,
	verifyPasskeyRequest
} from '$lib/server/auth/api';
import { ExpiringTokenBucket } from '$lib/server/auth/rate-limit';
import type { RequestEvent } from './$types';

const assertionBucket = new ExpiringTokenBucket<string>('settings-passkey-reauth', 5, 15 * 60);

export async function POST(event: RequestEvent) {
	const guarded = requireVerifiedSession(event);
	if (guarded.response) return guarded.response;
	const { session, user } = guarded.authenticated;
	if (!user.registeredPasskey) return authError(403, 'Passkey reauthentication is not available');
	if (!assertionBucket.consume(session.id, 1)) return authError(429, 'Too many requests');
	const verified = await verifyPasskeyRequest(event.request, user.id, 'settings-reauth');
	if (verified.response) return verified.response;
	assertionBucket.reset(session.id);
	rotateSessionAfterReauthentication(event, session);
	return authSuccess(null);
}
