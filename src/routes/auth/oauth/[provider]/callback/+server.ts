import { isRedirect, redirect } from '@sveltejs/kit';
import { error as logError } from '#lib/logger.js';
import { hasRecentReauthentication, rotateSessionAfterReauthentication } from '#lib/server/auth.js';
import { completeLoginFirstFactor } from '#lib/server/auth/login.js';
import { invalidateLoginAttemptRequest } from '#lib/server/auth/login-attempt.js';
import { OAuthCallbackError, validateOAuthCallback } from '#lib/server/auth/oauth.js';
import {
	createOrLinkOAuthUser,
	getUserFromOAuthAccount,
	linkUserOAuthAccount,
	updateUserOAuthAccountTokens
} from '#lib/server/auth/user.js';
import { formatOAuthError } from '#lib/server/oauth.js';
import {
	createOAuthConnectedRedirect,
	createOAuthErrorRedirect,
	parseOAuthProvider,
	type OAuthErrorCode
} from '#lib/types/oauth.js';
import type { RequestEvent } from './$types';

export async function GET(event: RequestEvent) {
	const provider = parseOAuthProvider(event.params.provider);
	if (provider === null) {
		redirect(303, createOAuthErrorRedirect('/#login', 'provider', null, event.url));
	}

	let errorDestination = '/#login';
	try {
		const callback = await validateOAuthCallback(event, provider);
		errorDestination = getOAuthDestination(callback.flow, callback.returnTo);
		if (callback.flow === 'reauth') {
			if (event.locals.session === null || event.locals.user === null) {
				redirect(303, createOAuthErrorRedirect('/#login', 'session', provider, event.url));
			}
			if (event.locals.user.registeredTOTP || event.locals.user.registeredPasskey) {
				redirect(
					303,
					createOAuthErrorRedirect(callback.returnTo ?? '/settings', 'factor', provider, event.url)
				);
			}
			const linkedUser = getUserFromOAuthAccount(provider, callback.profile.id);
			if (linkedUser?.id !== event.locals.user.id) {
				redirect(
					303,
					createOAuthErrorRedirect(
						callback.returnTo ?? '/settings',
						'identity',
						provider,
						event.url
					)
				);
			}
			if (
				!updateUserOAuthAccountTokens(
					event.locals.user.id,
					provider,
					callback.profile.id,
					callback.tokens
				)
			) {
				redirect(
					303,
					createOAuthErrorRedirect(
						callback.returnTo ?? '/settings',
						'identity',
						provider,
						event.url
					)
				);
			}
			rotateSessionAfterReauthentication(event, event.locals.session);
			redirect(303, callback.returnTo ?? '/settings');
		}
		if (callback.flow === 'link') {
			const destination = callback.returnTo ?? '/settings';
			if (event.locals.session === null || event.locals.user === null) {
				redirect(303, createOAuthErrorRedirect('/#login', 'session', provider, event.url));
			}
			if (!event.locals.user.emailVerified) {
				redirect(303, createOAuthErrorRedirect(destination, 'factor', provider, event.url));
			}
			if (!hasRecentReauthentication(event.locals.session)) {
				redirect(
					303,
					createOAuthErrorRedirect(destination, 'reauthentication', provider, event.url)
				);
			}

			const result = linkUserOAuthAccount(
				event.locals.user.id,
				provider,
				callback.profile.id,
				callback.tokens
			);
			if (result === 'provider-in-use') {
				redirect(
					303,
					createOAuthErrorRedirect(destination, 'connection-in-use', provider, event.url)
				);
			}
			if (result === 'provider-connected') {
				redirect(
					303,
					createOAuthErrorRedirect(destination, 'connection-exists', provider, event.url)
				);
			}
			if (result === 'user-not-found') {
				redirect(303, createOAuthErrorRedirect('/#login', 'session', provider, event.url));
			}
			redirect(303, createOAuthConnectedRedirect(destination, provider, event.url));
		}
		if (event.locals.session !== null) redirect(303, '/');

		invalidateLoginAttemptRequest(event);
		const user = createOrLinkOAuthUser(provider, callback.profile, callback.tokens);
		const next = completeLoginFirstFactor(event, user);
		redirect(303, next === null ? '/' : `/#${next}`);
	} catch (cause) {
		if (isRedirect(cause)) throw cause;
		if (cause instanceof OAuthCallbackError) {
			if (shouldLogOAuthError(cause.code)) {
				const oauthCause = cause.cause instanceof Error ? cause.cause : cause;
				logError(
					`Failed to complete ${provider} OAuth: ${formatOAuthError(oauthCause)}`,
					oauthCause
				);
			}
			const destination = getOAuthDestination(cause.flow, cause.returnTo);
			redirect(303, createOAuthErrorRedirect(destination, cause.code, provider, event.url));
		}
		logError(`Failed to complete ${provider} OAuth`, cause);
		redirect(303, createOAuthErrorRedirect(errorDestination, 'failed', provider, event.url));
	}
}

function getOAuthDestination(
	flow: import('#lib/server/auth/oauth.js').OAuthFlow,
	returnTo: string | null
): string {
	return flow === 'login' ? (returnTo ?? '/#login') : (returnTo ?? '/settings');
}

function shouldLogOAuthError(error: OAuthErrorCode): boolean {
	return error !== 'cancelled' && error !== 'expired' && error !== 'unverified-email';
}
