import { getUserEmailVerificationRequest } from '$lib/server/auth/email-verification';
import { getRequiredEnvironmentVariable } from '$lib/server/env';
import type { LayoutServerLoad } from './$types';

const WEBAUTHN_RP_NAME = getRequiredEnvironmentVariable('WEBAUTHN_RP_NAME', 'flightlesskiwi');

export const load: LayoutServerLoad = ({ locals }) => {
	if (locals.user === null || locals.session === null) {
		return { auth: null, webAuthnRPName: WEBAUTHN_RP_NAME };
	}

	const verificationEmail = locals.user.emailVerified
		? locals.user.email
		: (getUserEmailVerificationRequest(locals.user.id)?.email ?? locals.user.email);

	return {
		webAuthnRPName: WEBAUTHN_RP_NAME,
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
