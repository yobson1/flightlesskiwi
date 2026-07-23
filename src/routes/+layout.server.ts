import { WEBAUTHN_RP_NAME } from '$env/static/private';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
	if (locals.user === null || locals.session === null) {
		return { auth: null, webAuthnRPName: WEBAUTHN_RP_NAME };
	}

	return {
		webAuthnRPName: WEBAUTHN_RP_NAME,
		auth: {
			user: {
				email: locals.user.email,
				username: locals.user.username,
				emailVerified: locals.user.emailVerified,
				registeredTOTP: locals.user.registeredTOTP,
				registeredPasskey: locals.user.registeredPasskey,
				registered2FA: locals.user.registered2FA
			},
			twoFactorVerified: locals.session.twoFactorVerified
		}
	};
};
