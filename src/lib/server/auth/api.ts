import { json, redirect, type RequestEvent } from '@sveltejs/kit';
import { isSessionRecentlyReauthenticated, type Session } from '$lib/server/auth';
import type { AuthUser } from '$lib/server/auth/user';
import type { AuthModalView } from '$lib/types/auth';

export interface AuthenticatedRequest {
	session: Session;
	user: AuthUser;
}

export type AuthGuardResult =
	| { authenticated: AuthenticatedRequest; response?: never }
	| { authenticated?: never; response: Response };

export function authSuccess(
	next: AuthModalView | null,
	data: Record<string, unknown> = {}
): Response {
	return json({ ...data, next });
}

export function authError(
	status: number,
	message: string,
	options: { modal?: AuthModalView; reauthenticationRequired?: boolean } = {}
): Response {
	return json({ message, ...options }, { status });
}

export function requireAuthenticated(event: RequestEvent): AuthGuardResult {
	const { session, user } = event.locals;
	if (session === null || user === null) {
		return { response: authError(401, 'Sign in to continue', { modal: 'login' }) };
	}
	return { authenticated: { session, user } };
}

export function requireVerifiedPage(event: RequestEvent): AuthenticatedRequest {
	const result = requireVerifiedSession(event);
	if (result.response) {
		redirect(302, `/#${requiredModalForRequest(event)}`);
	}
	return result.authenticated;
}

export function requireVerifiedSession(
	event: RequestEvent,
	options: { recentlyReauthenticated?: boolean } = {}
): AuthGuardResult {
	const result = requireAuthenticated(event);
	if (result.response) return result;
	const { session, user } = result.authenticated;
	if (!user.emailVerified) {
		return {
			response: authError(403, 'Verify your email to continue', { modal: 'verify-email' })
		};
	}
	if (user.registered2FA && !session.twoFactorVerified) {
		return {
			response: authError(403, 'Complete two-factor authentication to continue', {
				modal: get2FAModal(user)
			})
		};
	}
	if (options.recentlyReauthenticated && !isSessionRecentlyReauthenticated(session)) {
		return {
			response: authError(428, 'Confirm your identity to continue', {
				reauthenticationRequired: true
			})
		};
	}
	return result;
}

function requiredModalForRequest(event: RequestEvent): AuthModalView {
	const { session, user } = event.locals;
	if (session === null || user === null) return 'login';
	if (!user.emailVerified) return 'verify-email';
	if (user.registered2FA && !session.twoFactorVerified) return get2FAModal(user);
	return 'login';
}

export function get2FAModal(user: AuthUser): AuthModalView {
	if (user.registeredTOTP) return 'totp';
	if (user.registeredPasskey) return 'passkey';
	return 'setup';
}
