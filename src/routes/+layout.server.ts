import { getUserEmailVerificationRequest } from '#lib/server/auth/email-verification.js';
import { getTurnstileSiteKey } from '#lib/server/turnstile.js';
import { getEnabledOAuthProviders } from '#lib/server/auth/oauth.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
	const turnstileSiteKey = getTurnstileSiteKey();
	const oauthProviders = getEnabledOAuthProviders();
	if (locals.user === null || locals.session === null) {
		return { auth: null, turnstileSiteKey, oauthProviders };
	}

	const verificationEmail = locals.user.emailVerified
		? locals.user.email
		: (getUserEmailVerificationRequest(locals.user.id)?.email ?? locals.user.email);

	return {
		turnstileSiteKey,
		oauthProviders,
		auth: {
			user: {
				email: locals.user.email,
				verificationEmail,
				username: locals.user.username,
				emailVerified: locals.user.emailVerified,
				hasPassword: locals.user.hasPassword,
				registeredTOTP: locals.user.registeredTOTP,
				registeredPasskey: locals.user.registeredPasskey,
				registered2FA: locals.user.registered2FA,
				recoveryCodeConfigured: locals.user.recoveryCodeConfigured,
				oauthProviders: locals.user.oauthProviders
			}
		}
	};
};
