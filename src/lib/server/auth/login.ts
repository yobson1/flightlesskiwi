import type { RequestEvent } from '@sveltejs/kit';
import { createSessionAndSetCookie } from '$lib/server/auth';
import { createLoginAttempt } from '$lib/server/auth/login-attempt';
import type { AuthUser } from '$lib/server/auth/user';
import type { AuthModalView } from '$lib/types/auth';

export function completeLoginFirstFactor(
	event: RequestEvent,
	user: AuthUser
): AuthModalView | null {
	if (user.registered2FA) {
		createLoginAttempt(event, user.id);
		return 'login-2fa';
	}
	return completeLogin(event, user);
}

export function completeLogin(event: RequestEvent, user: AuthUser): AuthModalView | null {
	createSessionAndSetCookie(event, user.id, { twoFactorVerified: true });
	return !user.emailVerified ? 'verify-email' : !user.registeredTOTP ? 'setup' : null;
}
