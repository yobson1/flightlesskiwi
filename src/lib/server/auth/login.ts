import type { RequestEvent } from '@sveltejs/kit';
import { createSessionAndSetCookie } from '#lib/server/auth.js';
import { createLoginAttempt } from '#lib/server/auth/login-attempt.js';
import type { AuthUser } from '#lib/server/auth/user.js';
import type { AuthModalView } from '#lib/types/auth.js';

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
	createSessionAndSetCookie(event, user.id);
	return !user.emailVerified ? 'verify-email' : !user.registeredTOTP ? 'setup' : null;
}
