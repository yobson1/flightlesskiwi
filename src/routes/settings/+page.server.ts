import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { decodeBase64, encodeBase64 } from '$lib/encoding';
import {
	MAX_PASSWORD_LENGTH,
	MAX_USERNAME_LENGTH,
	MIN_PASSWORD_LENGTH,
	MIN_USERNAME_LENGTH
} from '$lib/auth-constants';
import { error as logError, warn } from '$lib/logger';
import { fetchPasskeyAuthenticatorMetadata } from '$lib/passkey-authenticator-metadata';
import {
	createSessionAndSetCookie,
	deleteSessionTokenCookie,
	isSessionRecentlyReauthenticated
} from '$lib/server/auth';
import { requireVerifiedPage } from '$lib/server/auth/api';
import { deleteBenchmarkFiles } from '$lib/server/benchmark-files';
import { flushBenchmarkSearchQueue, queueBenchmarksForSearch } from '$lib/server/benchmark-search';
import {
	checkCodeEmailSendRateLimit,
	CodeEmailRateLimitError,
	getCodeEmailSendRetryAfterSeconds,
	sendVerificationEmail
} from '$lib/server/auth/email';
import {
	cancelEmailChangeVerificationRequest,
	createEmailChangeVerificationRequest,
	deleteEmailVerificationRequestCookie,
	getUserEmailVerificationRequest,
	setUserEmailAsUnverified,
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
	deleteUserOAuthAccount,
	isUserUniqueConstraintError,
	normalizeEmail,
	resetUserRecoveryCode,
	updateUserPassword,
	updateUserUsername,
	verifyEmailInput,
	verifyUsernameInput
} from '$lib/server/auth/user';
import { deleteUserPasskeyCredential, getUserPasskeyCredentials } from '$lib/server/auth/webauthn';
import { revokeOAuthTokens } from '$lib/server/auth/oauth';
import { db } from '$lib/server/db';
import { benchmarkFile, benchmarkResult, user as userTable } from '$lib/server/db/schema';
import {
	getOAuthProviderAuthorizationSettingsURL,
	getOAuthProviderName,
	isOAuthProvider
} from '$lib/types/oauth';
import type { Actions, RequestEvent } from './$types';

const passwordUpdateBucket = new ExpiringTokenBucket<string>('password-update', 5, 30 * 60);

export async function load(event: RequestEvent) {
	event.setHeaders({ 'cache-control': 'no-store' });
	const { session, user } = requireVerifiedPage(event);
	const passkeyCredentials = getUserPasskeyCredentials(user.id);
	const authenticatorMetadata =
		passkeyCredentials.length > 0 ? await fetchPasskeyAuthenticatorMetadata(event.fetch) : {};
	return {
		user,
		recoveryCodeConfigured: user.recoveryCodeConfigured,
		recentlyReauthenticated: isSessionRecentlyReauthenticated(session),
		passkeyCredentials: passkeyCredentials.map((credential) => ({
			id: encodeBase64(credential.id),
			name: credential.name,
			iconDark: credential.aaguid ? authenticatorMetadata[credential.aaguid]?.iconDark : undefined,
			iconLight: credential.aaguid ? authenticatorMetadata[credential.aaguid]?.iconLight : undefined
		}))
	};
}

export const actions: Actions = {
	update_username: updateUsername,
	update_password: updatePassword,
	update_email: updateEmail,
	disconnect_totp: disconnectTOTP,
	disconnect_oauth: disconnectOAuth,
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
				message: `Username must be ${MIN_USERNAME_LENGTH}–${MAX_USERNAME_LENGTH} letters, numbers, spaces, underscores, or hyphens`
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
				message: `New password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters`
			}
		});
	}
	if (!passwordUpdateBucket.consume(event.locals.session.id, 1)) {
		return fail(429, { password: { message: 'Too many requests' } });
	}
	passwordUpdateBucket.reset(event.locals.session.id);
	await updateUserPassword(event.locals.user.id, newPassword);
	invalidateUserPasswordResetSessions(event.locals.user.id);

	createSessionAndSetCookie(event, event.locals.user.id, {
		twoFactorVerified: event.locals.session.twoFactorVerified
	});
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
	const formData = await event.request.formData();
	const rawEmail = formData.get('email');
	if (typeof rawEmail !== 'string') {
		return fail(400, { email: { message: 'Invalid or missing fields' } });
	}
	const email = normalizeEmail(rawEmail);
	if (!verifyEmailInput(email)) {
		return fail(400, { email: { message: 'Invalid email' } });
	}
	const pendingRequest = getUserEmailVerificationRequest(event.locals.user.id);
	if (pendingRequest !== null && pendingRequest.expiresAt.getTime() > Date.now()) {
		setUserEmailAsUnverified(event.locals.user.id);
		setEmailVerificationRequestCookie(event, pendingRequest);
		return {
			email: {
				message: 'Finish verifying your pending email change before starting another one'
			}
		};
	}
	if (!checkEmailAvailability(email)) {
		return fail(400, { email: { message: 'Email is already used' } });
	}
	if (!checkCodeEmailSendRateLimit(email)) {
		return fail(429, {
			email: {
				message: `Try again in ${getCodeEmailSendRetryAfterSeconds(email)} seconds`
			}
		});
	}
	const creation = createEmailChangeVerificationRequest(event.locals.user.id, email);
	if (!creation.created) {
		setUserEmailAsUnverified(event.locals.user.id);
		setEmailVerificationRequestCookie(event, creation.request);
		return {
			email: {
				message: 'Finish verifying your pending email change before starting another one'
			}
		};
	}
	const request = creation.request;
	try {
		await sendVerificationEmail(request.email, request.code);
	} catch (cause) {
		cancelEmailChangeVerificationRequest(request);
		deleteEmailVerificationRequestCookie(event);
		if (cause instanceof CodeEmailRateLimitError) {
			return fail(429, {
				email: { message: `Try again in ${cause.retryAfterSeconds} seconds` }
			});
		}
		logError('Failed to send email-change verification email', cause);
		return fail(503, {
			email: { message: 'The verification email could not be sent' }
		});
	}
	setEmailVerificationRequestCookie(event, request);
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

async function disconnectOAuth(event: RequestEvent) {
	if (event.locals.session === null || event.locals.user === null) {
		return fail(401, { connection: { message: 'Not authenticated' } });
	}
	if (
		!event.locals.user.emailVerified ||
		(event.locals.user.registered2FA && !event.locals.session.twoFactorVerified)
	) {
		return fail(403, { connection: { message: 'Forbidden' } });
	}
	if (!isSessionRecentlyReauthenticated(event.locals.session)) {
		return reauthenticationRequired('connection');
	}
	const formData = await event.request.formData();
	const provider = formData.get('provider');
	if (typeof provider !== 'string' || !isOAuthProvider(provider)) {
		return fail(400, { connection: { message: 'Invalid OAuth provider' } });
	}

	const result = deleteUserOAuthAccount(event.locals.user.id, provider);
	if (result.status === 'not-found') {
		return fail(404, { connection: { message: 'Connection not found' } });
	}
	if (result.status === 'last-sign-in-method') {
		return fail(400, {
			connection: {
				message:
					'Set a password or connect another OAuth account before removing your only permanent sign-in method'
			}
		});
	}

	const providerName = getOAuthProviderName(provider);
	if (result.tokens === null) {
		return {
			connection: {
				message: `Disconnected ${providerName} locally. Remove flightlesskiwi from your ${providerName} authorized apps to finish revoking access.`
			}
		};
	}
	try {
		await revokeOAuthTokens(provider, result.tokens);
	} catch (cause) {
		warn(`Failed to revoke ${provider} OAuth authorization after disconnecting locally`, cause);
		return {
			connection: {
				message: `Disconnected ${providerName} locally, but ${providerName} did not confirm revocation. Remove flightlesskiwi from your ${providerName} authorized apps.`
			}
		};
	}
	if (getOAuthProviderAuthorizationSettingsURL(provider) !== null) {
		return {
			connection: {
				message: `Disconnected ${providerName} locally and revoked its stored access token. Finish removing flightlesskiwi in ${providerName} Connections.`
			}
		};
	}
	return { connection: { message: `Disconnected ${providerName} and revoked its authorization` } };
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
	const benchmarkFileIds = db
		.select({ id: benchmarkFile.id })
		.from(benchmarkFile)
		.innerJoin(benchmarkResult, eq(benchmarkFile.benchmarkId, benchmarkResult.id))
		.where(eq(benchmarkResult.userId, event.locals.user.id))
		.all()
		.map(({ id }) => id);
	const benchmarkIds = db
		.select({ id: benchmarkResult.id })
		.from(benchmarkResult)
		.where(eq(benchmarkResult.userId, event.locals.user.id))
		.all()
		.map(({ id }) => id);
	const deletedUser = db.transaction((tx) => {
		queueBenchmarksForSearch(benchmarkIds, tx);
		return tx
			.delete(userTable)
			.where(eq(userTable.id, event.locals.user!.id))
			.returning({ id: userTable.id })
			.get();
	});
	if (!deletedUser) {
		return fail(404, { account: { message: 'Account not found' } });
	}
	try {
		await deleteBenchmarkFiles(benchmarkFileIds);
	} catch (cause) {
		logError(`Failed to clean up benchmark files for deleted user ${event.locals.user.id}`, cause);
	}
	try {
		await flushBenchmarkSearchQueue();
	} catch (cause) {
		logError(`Failed to remove deleted user benchmarks from search`, cause);
	}

	deleteSessionTokenCookie(event);
	deleteEmailVerificationRequestCookie(event);
	deletePasswordResetSessionTokenCookie(event);
	deletePendingRecoveryCodeCookie(event);
	deleteTOTPSetupCookie(event);
	return {};
}

function reauthenticationRequired(
	field?: 'username' | 'password' | 'email' | 'connection' | 'account'
) {
	const message = 'Confirm your identity to continue';
	return fail(428, {
		reauthenticationRequired: true,
		message,
		...(field ? { [field]: { message } } : {})
	});
}
