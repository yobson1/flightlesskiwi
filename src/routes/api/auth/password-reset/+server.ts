import { error as logError } from '$lib/logger';
import {
	EMAIL_CODE_LENGTH,
	MAX_PASSWORD_LENGTH,
	MIN_PASSWORD_LENGTH,
	TOTP_CODE_LENGTH_WORD
} from '$lib/auth-constants';
import { createSessionAndSetCookie } from '$lib/server/auth';
import { isRecoveryCode, verifyUserRecoveryCode } from '$lib/server/auth/2fa';
import { authError, authSuccess, getClientIP } from '$lib/server/auth/api';
import { sendPasswordResetEmail } from '$lib/server/auth/email';
import { verifyPasswordStrength } from '$lib/server/auth/password';
import {
	createPasswordResetSession,
	deletePasswordResetSessionTokenCookie,
	getPasswordResetState,
	invalidateUserPasswordResetSessions,
	setPasswordResetSessionAs2FAVerified,
	setPasswordResetSessionAsEmailVerified,
	setPasswordResetSessionTokenCookie,
	validatePasswordResetSessionRequest,
	verifyPasswordResetCode,
	type PasswordResetSession
} from '$lib/server/auth/password-reset';
import { ExpiringTokenBucket, RefillingTokenBucket } from '$lib/server/auth/rate-limit';
import { isTOTPCode, verifyUserTOTP } from '$lib/server/auth/totp';
import {
	getUserFromEmail,
	normalizeEmail,
	setUserAsEmailVerifiedIfEmailMatches,
	updateUserPassword,
	verifyEmailInput,
	type AuthUser
} from '$lib/server/auth/user';
import type { RequestEvent } from './$types';

const requestIPBucket = new RefillingTokenBucket<string>('password-reset-modal-ip', 3, 60);
const requestEmailBucket = new RefillingTokenBucket<string>('password-reset-modal-email', 3, 60);
const codeBucket = new ExpiringTokenBucket<string>('password-reset-modal-code', 5, 30 * 60);

export function GET(event: RequestEvent) {
	if (event.locals.session !== null) {
		return authError(409, 'You are already signed in');
	}
	const { session, user } = validatePasswordResetSessionRequest(event);
	if (session === null) {
		return authSuccess('password-reset', { stage: 'request' });
	}
	return stateResponse(session, user);
}

export async function POST(event: RequestEvent) {
	if (event.locals.session !== null) {
		return authError(409, 'You are already signed in');
	}

	let formData: FormData;
	try {
		formData = await event.request.formData();
	} catch {
		return authError(400, 'Invalid request');
	}
	const step = formData.get('step');
	if (step === 'request') return requestReset(event, formData);
	if (step === 'email-code') return verifyEmailCode(event, formData);
	if (step === 'totp') return verifyTOTP(event, formData);
	if (step === 'recovery-code') return verifyRecoveryCode(event, formData);
	if (step === 'password') return updatePassword(event, formData);
	return authError(400, 'Invalid reset step');
}

async function requestReset(event: RequestEvent, formData: FormData): Promise<Response> {
	const clientIP = getClientIP(event);
	if (!requestIPBucket.check(clientIP, 1)) {
		return authError(429, 'Too many reset requests. Try again later.');
	}
	const rawEmail = formData.get('email');
	if (typeof rawEmail !== 'string') {
		return authError(400, 'Enter your email');
	}
	const email = normalizeEmail(rawEmail);
	if (!verifyEmailInput(email)) {
		return authError(400, 'Enter a valid email');
	}
	if (!requestIPBucket.consume(clientIP, 1) || !requestEmailBucket.consume(email, 1)) {
		return authError(429, 'Too many reset requests. Try again later.');
	}

	const genericMessage = 'If an account uses that email, a reset code has been sent.';
	const user = getUserFromEmail(email);
	if (user === null) {
		deletePasswordResetSessionTokenCookie(event);
		return authSuccess('password-reset', {
			stage: 'email-code',
			email,
			message: genericMessage
		});
	}

	const session = createPasswordResetSession(user.id, user.email);
	setPasswordResetSessionTokenCookie(event, session.token, session.expiresAt);
	try {
		await sendPasswordResetEmail(session.email, session.code);
	} catch (cause) {
		invalidateUserPasswordResetSessions(user.id);
		deletePasswordResetSessionTokenCookie(event);
		logError('Failed to send password reset email', cause);
		return authError(503, 'The password reset email could not be sent');
	}
	return authSuccess('password-reset', {
		stage: 'email-code',
		email: session.email,
		message: genericMessage
	});
}

function verifyEmailCode(event: RequestEvent, formData: FormData): Response {
	const { session, user } = validatePasswordResetSessionRequest(event);
	const code = formData.get('code');
	if (
		session === null ||
		session.emailVerified ||
		typeof code !== 'string' ||
		code.length !== EMAIL_CODE_LENGTH
	) {
		return authError(400, 'Incorrect or expired reset code');
	}
	if (!codeBucket.consume(session.userId, 1)) {
		return authError(429, 'Too many attempts. Try again later.');
	}
	if (!verifyPasswordResetCode(session, code.toUpperCase())) {
		return authError(400, 'Incorrect or expired reset code');
	}
	codeBucket.reset(session.userId);
	setPasswordResetSessionAsEmailVerified(session.id);
	if (!setUserAsEmailVerifiedIfEmailMatches(session.userId, session.email)) {
		invalidateUserPasswordResetSessions(session.userId);
		deletePasswordResetSessionTokenCookie(event);
		return authError(400, 'Your account email changed. Restart the reset process.');
	}
	return stateResponse({ ...session, emailVerified: true }, user);
}

function verifyTOTP(event: RequestEvent, formData: FormData): Response {
	const { session, user } = validatePasswordResetSessionRequest(event);
	if (
		session === null ||
		!session.emailVerified ||
		session.twoFactorVerified ||
		!user.registeredTOTP
	) {
		return authError(403, 'Authenticator verification is not available');
	}
	const code = formData.get('code');
	if (!isTOTPCode(code)) {
		return authError(400, `Enter the ${TOTP_CODE_LENGTH_WORD}-digit authenticator code`);
	}
	const verification = verifyUserTOTP(session.userId, code);
	if (verification === 'rate-limited') {
		return authError(429, 'Too many attempts. Try again later.');
	}
	if (verification === 'invalid') {
		return authError(400, 'Invalid authenticator code');
	}
	setPasswordResetSessionAs2FAVerified(session.id);
	return stateResponse({ ...session, twoFactorVerified: true }, user);
}

async function verifyRecoveryCode(event: RequestEvent, formData: FormData): Promise<Response> {
	const { session, user } = validatePasswordResetSessionRequest(event);
	if (
		session === null ||
		!session.emailVerified ||
		session.twoFactorVerified ||
		!user.registered2FA ||
		!user.recoveryCodeConfigured
	) {
		return authError(403, 'Recovery-code verification is not available');
	}
	const code = formData.get('code');
	if (!isRecoveryCode(code)) {
		return authError(400, 'Enter your recovery code');
	}
	const verification = await verifyUserRecoveryCode(session.userId, code);
	if (verification === 'rate-limited') {
		return authError(429, 'Too many attempts. Try again later.');
	}
	if (verification === 'invalid') {
		return authError(400, 'Invalid recovery code');
	}
	setPasswordResetSessionAs2FAVerified(session.id);
	return stateResponse({ ...session, twoFactorVerified: true }, user);
}

async function updatePassword(event: RequestEvent, formData: FormData): Promise<Response> {
	const { session, user } = validatePasswordResetSessionRequest(event);
	if (
		session === null ||
		!session.emailVerified ||
		(user.registered2FA && !session.twoFactorVerified)
	) {
		return authError(403, 'Complete password reset verification first');
	}
	const password = formData.get('password');
	const confirmPassword = formData.get('confirmPassword');
	if (typeof password !== 'string' || typeof confirmPassword !== 'string') {
		return authError(400, 'Enter and confirm your new password');
	}
	if (password !== confirmPassword) {
		return authError(400, 'Passwords do not match');
	}
	if (!verifyPasswordStrength(password)) {
		return authError(
			400,
			`Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters`
		);
	}

	await updateUserPassword(user.id, password);
	invalidateUserPasswordResetSessions(user.id);
	createSessionAndSetCookie(event, user.id, { twoFactorVerified: true });
	deletePasswordResetSessionTokenCookie(event);
	return authSuccess(null, { message: 'Your password has been updated.' });
}

function stateResponse(session: PasswordResetSession, user: AuthUser): Response {
	return authSuccess('password-reset', getPasswordResetState(session, user));
}
