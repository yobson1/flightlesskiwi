import { dev } from '$app/env';
import type { RequestEvent } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	loginAttempt,
	passkeyCredential,
	passwordResetSession as sessionTable,
	session as authSession,
	totpCredential,
	user as userTable
} from '$lib/server/db/schema';
import { EMAIL_CODE_TTL_MS } from '$lib/server/auth/email';
import { hashAuthCode } from '$lib/server/auth/encryption';
import { hashPassword } from '$lib/server/auth/password';
import { getUserById, type AuthUser } from '$lib/server/auth/user';
import {
	constantTimeEqual,
	generateRandomOTP,
	generateSecureRandomString,
	hashSecret,
	parseTwoPartToken
} from '$lib/server/auth/utils';

const cookieName = 'password_reset_session';

export function createPasswordResetSession(
	userId: string,
	email: string
): PasswordResetSessionWithTokenAndCode {
	const id = generateSecureRandomString();
	const secret = generateSecureRandomString();
	const session: PasswordResetSessionWithTokenAndCode = {
		id,
		userId,
		email,
		expiresAt: new Date(Date.now() + EMAIL_CODE_TTL_MS),
		emailVerified: false,
		twoFactorVerified: false,
		token: `${id}.${secret}`,
		code: generateRandomOTP()
	};

	db.transaction((tx) => {
		tx.delete(sessionTable).where(eq(sessionTable.userId, userId)).run();
		tx.insert(sessionTable)
			.values({
				id,
				userId,
				secretHash: hashSecret(secret),
				email,
				codeHash: hashAuthCode(session.code),
				expiresAt: session.expiresAt,
				emailVerified: false,
				twoFactorVerified: false
			})
			.run();
	});
	return session;
}

function validatePasswordResetSessionToken(token: string): PasswordResetSessionValidationResult {
	const tokenParts = parseTwoPartToken(token);
	if (tokenParts === null) {
		return { session: null, user: null };
	}
	const row = db.select().from(sessionTable).where(eq(sessionTable.id, tokenParts.id)).get();
	if (
		!row ||
		!constantTimeEqual(row.secretHash, hashSecret(tokenParts.secret)) ||
		row.expiresAt <= new Date()
	) {
		if (row?.expiresAt && row.expiresAt <= new Date()) {
			db.delete(sessionTable).where(eq(sessionTable.id, row.id)).run();
		}
		return { session: null, user: null };
	}
	const user = getUserById(row.userId);
	if (user === null) {
		return { session: null, user: null };
	}
	return {
		session: {
			id: row.id,
			userId: row.userId,
			email: row.email,
			codeHash: row.codeHash,
			expiresAt: row.expiresAt,
			emailVerified: row.emailVerified,
			twoFactorVerified: row.twoFactorVerified
		},
		user
	};
}

export function verifyPasswordResetCode(session: PasswordResetSession, code: string): boolean {
	return constantTimeEqual(session.codeHash, hashAuthCode(code));
}

export function setPasswordResetSessionAsEmailVerified(sessionId: string): void {
	db.update(sessionTable).set({ emailVerified: true }).where(eq(sessionTable.id, sessionId)).run();
}

export function setPasswordResetSessionAs2FAVerified(sessionId: string): void {
	db.update(sessionTable)
		.set({ twoFactorVerified: true })
		.where(eq(sessionTable.id, sessionId))
		.run();
}

export async function completePasswordReset(sessionId: string, password: string): Promise<boolean> {
	const passwordHash = await hashPassword(password);
	const now = new Date();

	return db.transaction((tx) => {
		const reset = tx
			.select({
				id: sessionTable.id,
				userId: sessionTable.userId,
				email: sessionTable.email,
				expiresAt: sessionTable.expiresAt,
				emailVerified: sessionTable.emailVerified,
				twoFactorVerified: sessionTable.twoFactorVerified
			})
			.from(sessionTable)
			.where(eq(sessionTable.id, sessionId))
			.get();
		if (!reset || reset.expiresAt <= now || !reset.emailVerified) return false;

		const user = tx
			.select({ email: userTable.email, emailVerified: userTable.emailVerified })
			.from(userTable)
			.where(eq(userTable.id, reset.userId))
			.get();
		if (!user || !user.emailVerified || user.email !== reset.email) return false;

		const registered2FA =
			tx
				.select({ userId: totpCredential.userId })
				.from(totpCredential)
				.where(eq(totpCredential.userId, reset.userId))
				.get() !== undefined ||
			tx
				.select({ id: passkeyCredential.id })
				.from(passkeyCredential)
				.where(eq(passkeyCredential.userId, reset.userId))
				.get() !== undefined;
		if (registered2FA && !reset.twoFactorVerified) return false;

		const consumed = tx
			.delete(sessionTable)
			.where(and(eq(sessionTable.id, reset.id), eq(sessionTable.userId, reset.userId)))
			.returning({ id: sessionTable.id })
			.get();
		if (!consumed) return false;

		tx.update(userTable).set({ passwordHash }).where(eq(userTable.id, reset.userId)).run();
		tx.delete(authSession).where(eq(authSession.userId, reset.userId)).run();
		tx.delete(loginAttempt).where(eq(loginAttempt.userId, reset.userId)).run();
		tx.delete(sessionTable).where(eq(sessionTable.userId, reset.userId)).run();
		return true;
	});
}

export function invalidateUserPasswordResetSessions(userId: string): void {
	db.delete(sessionTable).where(eq(sessionTable.userId, userId)).run();
}

function getPasswordResetStage(session: PasswordResetSession, user: AuthUser): PasswordResetStage {
	if (!session.emailVerified) return 'email-code';
	if (user.registered2FA && !session.twoFactorVerified) return 'two-factor';
	return 'password';
}

export function getPasswordResetState(
	session: PasswordResetSession,
	user: AuthUser
): PasswordResetState {
	const stage = getPasswordResetStage(session, user);
	return {
		stage,
		email: session.email,
		registeredTOTP: stage === 'two-factor' && user.registeredTOTP,
		registeredPasskey: stage === 'two-factor' && user.registeredPasskey
	};
}

export function validatePasswordResetSessionRequest(
	event: RequestEvent
): PasswordResetSessionValidationResult {
	const token = event.cookies.get(cookieName);
	if (!token) {
		return { session: null, user: null };
	}
	const result = validatePasswordResetSessionToken(token);
	if (result.session === null) {
		deletePasswordResetSessionTokenCookie(event);
	}
	return result;
}

export function setPasswordResetSessionTokenCookie(
	event: RequestEvent,
	token: string,
	expiresAt: Date
): void {
	event.cookies.set(cookieName, token, {
		expires: expiresAt,
		sameSite: 'lax',
		httpOnly: true,
		path: '/',
		secure: !dev
	});
}

export function deletePasswordResetSessionTokenCookie(event: RequestEvent): void {
	event.cookies.delete(cookieName, { path: '/' });
}

export interface PasswordResetSession {
	id: string;
	userId: string;
	email: string;
	codeHash: Uint8Array;
	expiresAt: Date;
	emailVerified: boolean;
	twoFactorVerified: boolean;
}

export interface PasswordResetSessionWithTokenAndCode extends Omit<
	PasswordResetSession,
	'codeHash'
> {
	token: string;
	code: string;
}

export type PasswordResetSessionValidationResult =
	{ session: PasswordResetSession; user: AuthUser } | { session: null; user: null };

export type PasswordResetStage = 'request' | 'email-code' | 'two-factor' | 'password';

interface PasswordResetState {
	stage: PasswordResetStage;
	email: string;
	registeredTOTP: boolean;
	registeredPasskey: boolean;
}
