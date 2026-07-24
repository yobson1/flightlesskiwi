import { authError, authSuccess, requireVerifiedSession } from '$lib/server/auth/api';
import { hashRecoveryCode } from '$lib/server/auth/password';
import {
	deletePendingRecoveryCodeCookie,
	getPendingRecoveryCode,
	setPendingRecoveryCodeCookie
} from '$lib/server/auth/recovery-code';
import { generateRandomRecoveryCode } from '$lib/server/auth/utils';
import { setUserRecoveryCodeHash } from '$lib/server/auth/user';
import type { RequestEvent } from './$types';

export function POST(event: RequestEvent) {
	event.setHeaders({ 'cache-control': 'no-store' });
	const guarded = requireVerifiedSession(event);
	if (guarded.response) return guarded.response;
	const { user } = guarded.authenticated;
	if (!user.registeredTOTP || user.recoveryCodeConfigured) {
		return authError(403, 'Recovery-code setup is not available');
	}
	let recoveryCode = getPendingRecoveryCode(event, user.id);
	if (recoveryCode === null) {
		recoveryCode = generateRandomRecoveryCode();
		setPendingRecoveryCodeCookie(event, user.id, recoveryCode);
	}
	return authSuccess('recovery-code', { recoveryCode });
}

export async function PUT(event: RequestEvent) {
	event.setHeaders({ 'cache-control': 'no-store' });
	const guarded = requireVerifiedSession(event);
	if (guarded.response) return guarded.response;
	const { user } = guarded.authenticated;
	if (!user.registeredTOTP || user.recoveryCodeConfigured) {
		return authError(403, 'Recovery-code setup is not available');
	}
	const recoveryCode = getPendingRecoveryCode(event, user.id);
	if (recoveryCode === null) {
		return authError(400, 'Recovery code setup expired');
	}
	const recoveryCodeHash = await hashRecoveryCode(recoveryCode);
	setUserRecoveryCodeHash(user.id, recoveryCodeHash);
	deletePendingRecoveryCodeCookie(event);
	return authSuccess(user.registeredPasskey ? null : 'setup');
}
