import { error as logError } from '$lib/logger';
import { createSession, generateSessionToken, setSessionTokenCookie } from '$lib/server/auth';
import { authError, authSuccess } from '$lib/server/auth/api';
import { sendPasswordResetEmail } from '$lib/server/auth/email';
import { verifyPasswordStrength } from '$lib/server/auth/password';
import {
	createPasswordResetSession,
	deletePasswordResetSessionTokenCookie,
	getPasswordResetStage,
	invalidateUserPasswordResetSessions,
	setPasswordResetSessionAs2FAVerified,
	setPasswordResetSessionAsEmailVerified,
	setPasswordResetSessionTokenCookie,
	validatePasswordResetSessionRequest,
	verifyPasswordResetCode,
	type PasswordResetSession
} from '$lib/server/auth/password-reset';
import { ExpiringTokenBucket, RefillingTokenBucket } from '$lib/server/auth/rate-limit';
import { getClientIP } from '$lib/server/auth/routes';
import { totpBucket, verifyAndConsumeUserTOTP } from '$lib/server/auth/totp';
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
		return noStore(authSuccess('password-reset', { stage: 'request' }));
	}
	return noStore(stateResponse(session, user));
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
	if (session === null || session.emailVerified || typeof code !== 'string' || code.length !== 8) {
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
	if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
		return authError(400, 'Enter the six-digit authenticator code');
	}
	if (!totpBucket.consume(session.userId, 1)) {
		return authError(429, 'Too many attempts. Try again later.');
	}
	if (!verifyAndConsumeUserTOTP(session.userId, code)) {
		return authError(400, 'Invalid authenticator code');
	}
	totpBucket.reset(session.userId);
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
		return authError(400, 'Password must be between 12 and 255 characters');
	}

	await updateUserPassword(user.id, password);
	invalidateUserPasswordResetSessions(user.id);
	const token = generateSessionToken();
	const newSession = createSession(token, user.id, { twoFactorVerified: true });
	setSessionTokenCookie(event, token, newSession.expiresAt);
	deletePasswordResetSessionTokenCookie(event);
	return authSuccess(null, { message: 'Your password has been updated.' });
}

function stateResponse(session: PasswordResetSession, user: AuthUser): Response {
	const stage = getPasswordResetStage(session, user);
	return authSuccess('password-reset', {
		stage,
		email: session.email,
		registeredTOTP: stage === 'two-factor' && user.registeredTOTP,
		registeredPasskey: stage === 'two-factor' && user.registeredPasskey
	});
}

function noStore(response: Response): Response {
	response.headers.set('cache-control', 'no-store');
	return response;
}
