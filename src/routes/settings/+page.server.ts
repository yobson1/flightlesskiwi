import { decodeBase64, encodeBase64 } from '@oslojs/encoding';
import { fail, redirect } from '@sveltejs/kit';
import { error as logError } from '$lib/logger';
import {
	createSession,
	generateSessionToken,
	isSessionRecentlyReauthenticated,
	rotateSessionAfterReauthentication,
	setSessionTokenCookie
} from '$lib/server/auth';
import { get2FARedirect } from '$lib/server/auth/2fa';
import { sendVerificationEmail } from '$lib/server/auth/email';
import {
	createEmailVerificationRequest,
	sendVerificationEmailBucket,
	setEmailVerificationRequestCookie
} from '$lib/server/auth/email-verification';
import { verifyPasswordHash, verifyPasswordStrength } from '$lib/server/auth/password';
import { invalidateUserPasswordResetSessions } from '$lib/server/auth/password-reset';
import { ExpiringTokenBucket } from '$lib/server/auth/rate-limit';
import {
	deleteUserTOTPKey,
	totpBucket,
	totpUpdateBucket,
	verifyAndConsumeUserTOTP
} from '$lib/server/auth/totp';
import {
	checkEmailAvailability,
	getUserPasswordHash,
	normalizeEmail,
	resetUserRecoveryCode,
	updateUserPassword,
	verifyEmailInput
} from '$lib/server/auth/user';
import { deleteUserPasskeyCredential, getUserPasskeyCredentials } from '$lib/server/auth/webauthn';
import type { Actions, RequestEvent } from './$types';

const passwordUpdateBucket = new ExpiringTokenBucket<string>('password-update', 5, 30 * 60);
const settingsReauthBucket = new ExpiringTokenBucket<string>('settings-reauth', 5, 15 * 60);
const reauthenticationDestinations = new Set(['/2fa/totp/setup', '/2fa/passkey/register']);

export function load(event: RequestEvent) {
	event.setHeaders({ 'cache-control': 'no-store' });
	if (event.locals.session === null || event.locals.user === null) {
		redirect(302, '/login');
	}
	if (!event.locals.user.emailVerified) {
		redirect(302, '/verify-email');
	}
	if (event.locals.user.registered2FA && !event.locals.session.twoFactorVerified) {
		redirect(302, get2FARedirect(event.locals.user));
	}
	const requestedDestination = event.url.searchParams.get('next');
	return {
		user: event.locals.user,
		recoveryCodeConfigured: event.locals.user.recoveryCodeConfigured,
		recentlyReauthenticated: isSessionRecentlyReauthenticated(event.locals.session),
		reauthenticationDestination:
			requestedDestination !== null && reauthenticationDestinations.has(requestedDestination)
				? requestedDestination
				: null,
		passkeyCredentials: getUserPasskeyCredentials(event.locals.user.id).map((credential) => ({
			id: encodeBase64(credential.id),
			name: credential.name
		}))
	};
}

export const actions: Actions = {
	reauth_password: reauthenticateWithPassword,
	reauth_totp: reauthenticateWithTOTP,
	update_password: updatePassword,
	update_email: updateEmail,
	disconnect_totp: disconnectTOTP,
	delete_passkey: deletePasskey,
	regenerate_recovery_code: regenerateRecoveryCode
};

async function updatePassword(event: RequestEvent) {
	if (event.locals.session === null || event.locals.user === null) {
		return fail(401, { password: { message: 'Not authenticated' } });
	}
	if (
		!event.locals.user.emailVerified ||
		(event.locals.user.registered2FA && !event.locals.session.twoFactorVerified)
	) {
		return fail(403, { password: { message: 'Forbidden' } });
	}
	if (!isSessionRecentlyReauthenticated(event.locals.session)) {
		return reauthenticationRequired('password');
	}
	if (!passwordUpdateBucket.check(event.locals.session.id, 1)) {
		return fail(429, { password: { message: 'Too many requests' } });
	}
	const formData = await event.request.formData();
	const newPassword = formData.get('new_password');
	const confirmPassword = formData.get('confirm_password');
	if (typeof newPassword !== 'string' || typeof confirmPassword !== 'string') {
		return fail(400, { password: { message: 'Invalid or missing fields' } });
	}
	if (newPassword !== confirmPassword) {
		return fail(400, { password: { message: 'Passwords do not match' } });
	}
	if (!verifyPasswordStrength(newPassword)) {
		return fail(400, {
			password: {
				message: 'New password must be between 12 and 255 characters'
			}
		});
	}
	if (!passwordUpdateBucket.consume(event.locals.session.id, 1)) {
		return fail(429, { password: { message: 'Too many requests' } });
	}
	passwordUpdateBucket.reset(event.locals.session.id);
	await updateUserPassword(event.locals.user.id, newPassword);
	invalidateUserPasswordResetSessions(event.locals.user.id);

	const token = generateSessionToken();
	const session = createSession(token, event.locals.user.id, {
		twoFactorVerified: event.locals.session.twoFactorVerified
	});
	setSessionTokenCookie(event, token, session.expiresAt);
	return { password: { message: 'Updated password' } };
}

async function updateEmail(event: RequestEvent) {
	if (event.locals.session === null || event.locals.user === null) {
		return fail(401, { email: { message: 'Not authenticated' } });
	}
	if (
		!event.locals.user.emailVerified ||
		(event.locals.user.registered2FA && !event.locals.session.twoFactorVerified)
	) {
		return fail(403, { email: { message: 'Forbidden' } });
	}
	if (!isSessionRecentlyReauthenticated(event.locals.session)) {
		return reauthenticationRequired('email');
	}
	if (!sendVerificationEmailBucket.check(event.locals.user.id, 1)) {
		return fail(429, { email: { message: 'Too many requests' } });
	}
	const formData = await event.request.formData();
	const rawEmail = formData.get('email');
	if (typeof rawEmail !== 'string') {
		return fail(400, { email: { message: 'Invalid or missing fields' } });
	}
	const email = normalizeEmail(rawEmail);
	if (!verifyEmailInput(email)) {
		return fail(400, { email: { message: 'Invalid email' } });
	}
	if (!checkEmailAvailability(email)) {
		return fail(400, { email: { message: 'Email is already used' } });
	}
	if (!sendVerificationEmailBucket.consume(event.locals.user.id, 1)) {
		return fail(429, { email: { message: 'Too many requests' } });
	}
	const request = createEmailVerificationRequest(event.locals.user.id, email);
	setEmailVerificationRequestCookie(event, request);
	try {
		await sendVerificationEmail(request.email, request.code);
	} catch (cause) {
		logError('Failed to send email-change verification email', cause);
		return fail(503, {
			email: { message: 'The verification email could not be sent' }
		});
	}
	redirect(302, '/verify-email');
}

async function disconnectTOTP(event: RequestEvent) {
	if (event.locals.session === null || event.locals.user === null) {
		return fail(401);
	}
	if (
		!event.locals.user.emailVerified ||
		(event.locals.user.registered2FA && !event.locals.session.twoFactorVerified)
	) {
		return fail(403);
	}
	if (!isSessionRecentlyReauthenticated(event.locals.session)) {
		return reauthenticationRequired();
	}
	if (!totpUpdateBucket.consume(event.locals.user.id, 1)) {
		return fail(429);
	}
	deleteUserTOTPKey(event.locals.user.id);
	return {};
}

async function deletePasskey(event: RequestEvent) {
	if (event.locals.session === null || event.locals.user === null) {
		return fail(401);
	}
	if (
		!event.locals.user.emailVerified ||
		(event.locals.user.registered2FA && !event.locals.session.twoFactorVerified)
	) {
		return fail(403);
	}
	if (!isSessionRecentlyReauthenticated(event.locals.session)) {
		return reauthenticationRequired();
	}
	const formData = await event.request.formData();
	const encodedCredentialId = formData.get('credential_id');
	if (typeof encodedCredentialId !== 'string') {
		return fail(400);
	}
	try {
		if (!deleteUserPasskeyCredential(event.locals.user.id, decodeBase64(encodedCredentialId))) {
			return fail(400);
		}
	} catch {
		return fail(400);
	}
	return {};
}

async function regenerateRecoveryCode(event: RequestEvent) {
	if (event.locals.session === null || event.locals.user === null) {
		return fail(401);
	}
	if (
		!event.locals.user.emailVerified ||
		!event.locals.user.registered2FA ||
		!event.locals.user.registeredTOTP ||
		!event.locals.session.twoFactorVerified
	) {
		return fail(403);
	}
	if (!isSessionRecentlyReauthenticated(event.locals.session)) {
		return reauthenticationRequired();
	}
	return {
		recoveryCode: await resetUserRecoveryCode(event.locals.user.id)
	};
}

async function reauthenticateWithPassword(event: RequestEvent) {
	if (event.locals.session === null || event.locals.user === null) {
		return fail(401, { message: 'Not authenticated' });
	}
	if (
		!event.locals.user.emailVerified ||
		!event.locals.session.twoFactorVerified ||
		event.locals.user.registeredTOTP ||
		event.locals.user.registeredPasskey
	) {
		return fail(403, { message: 'Forbidden' });
	}
	const formData = await event.request.formData();
	const password = formData.get('password');
	if (typeof password !== 'string' || password.length === 0 || password.length > 255) {
		return fail(400, { message: 'Enter your password' });
	}
	if (!settingsReauthBucket.consume(event.locals.session.id, 1)) {
		return fail(429, { message: 'Too many requests' });
	}
	if (!(await verifyPasswordHash(getUserPasswordHash(event.locals.user.id), password))) {
		return fail(400, { message: 'Incorrect password' });
	}
	settingsReauthBucket.reset(event.locals.session.id);
	rotateSessionAfterReauthentication(event, event.locals.session);
	return { reauthenticated: true };
}

async function reauthenticateWithTOTP(event: RequestEvent) {
	if (event.locals.session === null || event.locals.user === null) {
		return fail(401, { message: 'Not authenticated' });
	}
	if (
		!event.locals.user.emailVerified ||
		!event.locals.session.twoFactorVerified ||
		!event.locals.user.registeredTOTP
	) {
		return fail(403, { message: 'Forbidden' });
	}
	const formData = await event.request.formData();
	const code = formData.get('code');
	if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
		return fail(400, { message: 'Enter the six-digit code' });
	}
	if (
		!settingsReauthBucket.consume(event.locals.session.id, 1) ||
		!totpBucket.consume(event.locals.user.id, 1)
	) {
		return fail(429, { message: 'Too many requests' });
	}
	if (!verifyAndConsumeUserTOTP(event.locals.user.id, code)) {
		return fail(400, { message: 'Invalid authenticator code' });
	}
	settingsReauthBucket.reset(event.locals.session.id);
	totpBucket.reset(event.locals.user.id);
	rotateSessionAfterReauthentication(event, event.locals.session);
	return { reauthenticated: true };
}

function reauthenticationRequired(field?: 'password' | 'email') {
	const message = 'Confirm your identity to continue';
	return fail(428, {
		reauthenticationRequired: true,
		message,
		...(field ? { [field]: { message } } : {})
	});
}
