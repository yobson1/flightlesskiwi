import { authError, authSuccess, requireVerifiedSession } from '#lib/server/auth/api.js';
import { hashRecoveryCode } from '#lib/server/auth/password.js';
import {
	deletePendingRecoveryCodeCookie,
	getPendingRecoveryCode,
	setPendingRecoveryCodeCookie
} from '#lib/server/auth/recovery-code.js';
import { generateRandomRecoveryCode } from '#lib/server/auth/utils.js';
import { setUserRecoveryCodeHash } from '#lib/server/auth/user.js';
import type { RequestEvent } from './$types';

export function POST(event: RequestEvent) {
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
