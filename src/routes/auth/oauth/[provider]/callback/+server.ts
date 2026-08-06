import { isRedirect, redirect } from '@sveltejs/kit';
import { error as logError } from '$lib/logger';
import { rotateSessionAfterReauthentication } from '$lib/server/auth';
import { completeLoginFirstFactor } from '$lib/server/auth/login';
import { invalidateLoginAttemptRequest } from '$lib/server/auth/login-attempt';
import { validateOAuthCallback } from '$lib/server/auth/oauth';
import { createOrLinkOAuthUser, getUserFromOAuthAccount } from '$lib/server/auth/user';
import { isOAuthProvider } from '$lib/types/oauth';
import type { RequestEvent } from './$types';

export async function GET(event: RequestEvent) {
	if (!isOAuthProvider(event.params.provider)) redirect(303, '/?oauth_error=provider#login');

	try {
		const callback = await validateOAuthCallback(event, event.params.provider);
		if (callback.flow === 'reauth') {
			if (event.locals.session === null || event.locals.user === null) {
				redirect(303, '/?oauth_error=session#login');
			}
			if (event.locals.user.registeredTOTP || event.locals.user.registeredPasskey) {
				redirect(303, addOAuthError(callback.returnTo ?? '/settings', 'factor', event.url));
			}
			const linkedUser = getUserFromOAuthAccount(event.params.provider, callback.profile.id);
			if (linkedUser?.id !== event.locals.user.id) {
				redirect(303, addOAuthError(callback.returnTo ?? '/settings', 'identity', event.url));
			}
			rotateSessionAfterReauthentication(event, event.locals.session);
			redirect(303, callback.returnTo ?? '/settings');
		}
		if (event.locals.session !== null) redirect(303, '/');

		invalidateLoginAttemptRequest(event);
		const user =
			getUserFromOAuthAccount(event.params.provider, callback.profile.id) ??
			createOrLinkOAuthUser(event.params.provider, callback.profile);
		const next = completeLoginFirstFactor(event, user);
		redirect(303, next === null ? '/' : `/#${next}`);
	} catch (cause) {
		if (isRedirect(cause)) throw cause;
		logError(`Failed to complete ${event.params.provider} OAuth`, cause);
		redirect(303, '/?oauth_error=failed#login');
	}
}

function addOAuthError(path: string, error: string, baseURL: URL): string {
	const url = new URL(path, baseURL);
	url.searchParams.set('oauth_error', error);
	return `${url.pathname}${url.search}${url.hash}`;
}
