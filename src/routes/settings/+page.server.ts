import { decodeBase64, encodeBase64 } from '@oslojs/encoding';
import { fail } from '@sveltejs/kit';
import { error as logError } from '$lib/logger';
import {
	createSession,
	deleteSessionTokenCookie,
	generateSessionToken,
	isSessionRecentlyReauthenticated,
	setSessionTokenCookie
} from '$lib/server/auth';
import { requireVerifiedPage } from '$lib/server/auth/api';
import { sendVerificationEmail } from '$lib/server/auth/email';
import {
	createEmailVerificationRequest,
	deleteEmailVerificationRequestCookie,
	sendVerificationEmailBucket,
	setEmailVerificationRequestCookie
} from '$lib/server/auth/email-verification';
import { verifyPasswordStrength } from '$lib/server/auth/password';
import {
	deletePasswordResetSessionTokenCookie,
	invalidateUserPasswordResetSessions
} from '$lib/server/auth/password-reset';
import { ExpiringTokenBucket } from '$lib/server/auth/rate-limit';
import { deletePendingRecoveryCodeCookie } from '$lib/server/auth/recovery-code';
import { deleteUserTOTPKey, deleteTOTPSetupCookie, totpUpdateBucket } from '$lib/server/auth/totp';
import {
	checkEmailAvailability,
	checkUsernameAvailability,
	deleteUser,
	isUserUniqueConstraintError,
	normalizeEmail,
	resetUserRecoveryCode,
	updateUserPassword,
	updateUserUsername,
	verifyEmailInput,
	verifyUsernameInput
} from '$lib/server/auth/user';
import { deleteUserPasskeyCredential, getUserPasskeyCredentials } from '$lib/server/auth/webauthn';
import type { Actions, RequestEvent } from './$types';

const passwordUpdateBucket = new ExpiringTokenBucket<string>('password-update', 5, 30 * 60);

export function load(event: RequestEvent) {
	event.setHeaders({ 'cache-control': 'no-store' });
	const { session, user } = requireVerifiedPage(event);
	const passkeyCredentials = getUserPasskeyCredentials(user.id);
	return {
		user,
		recoveryCodeConfigured: user.recoveryCodeConfigured,
		recentlyReauthenticated: isSessionRecentlyReauthenticated(session),
		passkeyCredentials: passkeyCredentials.map((credential) => ({
			id: encodeBase64(credential.id),
			name: credential.name
		}))
	};
}

export const actions: Actions = {
	update_username: updateUsername,
	update_password: updatePassword,
	update_email: updateEmail,
	disconnect_totp: disconnectTOTP,
	delete_passkey: deletePasskey,
	regenerate_recovery_code: regenerateRecoveryCode,
	delete_account: deleteAccount
};

async function updateUsername(event: RequestEvent) {
	if (event.locals.session === null || event.locals.user === null) {
		return fail(401, { username: { message: 'Not authenticated' } });
	}
	if (
		!event.locals.user.emailVerified ||
		(event.locals.user.registered2FA && !event.locals.session.twoFactorVerified)
	) {
		return fail(403, { username: { message: 'Forbidden' } });
	}
	if (!isSessionRecentlyReauthenticated(event.locals.session)) {
		return reauthenticationRequired('username');
	}
	const formData = await event.request.formData();
	const username = formData.get('username');
	if (typeof username !== 'string') {
		return fail(400, { username: { message: 'Invalid or missing fields' } });
	}
	if (!verifyUsernameInput(username)) {
		return fail(400, {
			username: {
				message: 'Username must be 3–31 letters, numbers, spaces, underscores, or hyphens'
			}
		});
	}
	if (!checkUsernameAvailability(username, event.locals.user.id)) {
		return fail(400, { username: { message: 'Username is already used' } });
	}
	try {
		if (!updateUserUsername(event.locals.user.id, username)) {
			return fail(404, { username: { message: 'Account not found' } });
		}
	} catch (cause) {
		if (isUserUniqueConstraintError(cause, 'username')) {
			return fail(400, { username: { message: 'Username is already used' } });
		}
		logError('Failed to update username', cause);
		return fail(500, { username: { message: 'Unable to update username' } });
	}
	return { username: { message: 'Updated username' } };
}

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
	return { email: { message: 'Verification email sent' } };
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

async function deleteAccount(event: RequestEvent) {
	if (event.locals.session === null || event.locals.user === null) {
		return fail(401, { account: { message: 'Not authenticated' } });
	}
	if (
		!event.locals.user.emailVerified ||
		(event.locals.user.registered2FA && !event.locals.session.twoFactorVerified)
	) {
		return fail(403, { account: { message: 'Forbidden' } });
	}
	if (!isSessionRecentlyReauthenticated(event.locals.session)) {
		return reauthenticationRequired('account');
	}
	const formData = await event.request.formData();
	const username = formData.get('username');
	if (typeof username !== 'string' || username !== event.locals.user.username) {
		return fail(400, {
			account: { message: 'Enter your username exactly as shown to delete your account' }
		});
	}
	if (!deleteUser(event.locals.user.id)) {
		return fail(404, { account: { message: 'Account not found' } });
	}

	deleteSessionTokenCookie(event);
	deleteEmailVerificationRequestCookie(event);
	deletePasswordResetSessionTokenCookie(event);
	deletePendingRecoveryCodeCookie(event);
	deleteTOTPSetupCookie(event);
	return {};
}

function reauthenticationRequired(field?: 'username' | 'password' | 'email' | 'account') {
	const message = 'Confirm your identity to continue';
	return fail(428, {
		reauthenticationRequired: true,
		message,
		...(field ? { [field]: { message } } : {})
	});
}
