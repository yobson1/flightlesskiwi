import { decodeBase64 } from '@oslojs/encoding';
import { fail, redirect } from '@sveltejs/kit';
import { error as logError } from '$lib/logger';
import { createSession, generateSessionToken, setSessionTokenCookie } from '$lib/server/auth';
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
import { deleteUserTOTPKey, totpUpdateBucket } from '$lib/server/auth/totp';
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
	return {
		user: event.locals.user,
		recoveryCodeConfigured: event.locals.user.recoveryCodeConfigured,
		passkeyCredentials: getUserPasskeyCredentials(event.locals.user.id)
	};
}

export const actions: Actions = {
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
	if (event.locals.user.registered2FA && !event.locals.session.twoFactorVerified) {
		return fail(403, { password: { message: 'Forbidden' } });
	}
	if (!passwordUpdateBucket.check(event.locals.session.id, 1)) {
		return fail(429, { password: { message: 'Too many requests' } });
	}
	const formData = await event.request.formData();
	const password = formData.get('password');
	const newPassword = formData.get('new_password');
	if (typeof password !== 'string' || typeof newPassword !== 'string') {
		return fail(400, { password: { message: 'Invalid or missing fields' } });
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
	if (!(await verifyPasswordHash(getUserPasswordHash(event.locals.user.id), password))) {
		return fail(400, { password: { message: 'Incorrect password' } });
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
	if (event.locals.user.registered2FA && !event.locals.session.twoFactorVerified) {
		return fail(403, { email: { message: 'Forbidden' } });
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
	return {
		recoveryCode: await resetUserRecoveryCode(event.locals.user.id)
	};
}
