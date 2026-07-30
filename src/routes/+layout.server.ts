import { WEBAUTHN_RP_NAME } from '$app/env/private';
import { getUserEmailVerificationRequest } from '$lib/server/auth/email-verification';
import { getTurnstileSiteKey } from '$lib/server/turnstile';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
	const turnstileSiteKey = getTurnstileSiteKey();
	if (locals.user === null || locals.session === null) {
		return { auth: null, webAuthnRPName: WEBAUTHN_RP_NAME!, turnstileSiteKey };
	}

	const verificationEmail = locals.user.emailVerified
		? locals.user.email
		: (getUserEmailVerificationRequest(locals.user.id)?.email ?? locals.user.email);

	return {
		webAuthnRPName: WEBAUTHN_RP_NAME!,
		turnstileSiteKey,
		auth: {
			user: {
				email: locals.user.email,
				verificationEmail,
				username: locals.user.username,
				emailVerified: locals.user.emailVerified,
				registeredTOTP: locals.user.registeredTOTP,
				registeredPasskey: locals.user.registeredPasskey,
				registered2FA: locals.user.registered2FA,
				recoveryCodeConfigured: locals.user.recoveryCodeConfigured
			},
			twoFactorVerified: locals.session.twoFactorVerified
		}
	};
};
