import { dev } from '$app/environment';
import type { RequestEvent } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { passwordResetSession as sessionTable } from '$lib/server/db/schema';
import { hashAuthCode } from '$lib/server/auth/encryption';
import { getUserById, type AuthUser } from '$lib/server/auth/user';
import {
	constantTimeEqual,
	generateRandomOTP,
	generateSecureRandomString,
	hashSecret
} from '$lib/server/auth/utils';

const SESSION_TTL_MS = 10 * 60 * 1000;
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
		expiresAt: new Date(Date.now() + SESSION_TTL_MS),
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

export function validatePasswordResetSessionToken(
	token: string
): PasswordResetSessionValidationResult {
	const tokenParts = token.split('.');
	if (tokenParts.length !== 2 || !tokenParts[0] || !tokenParts[1]) {
		return { session: null, user: null };
	}
	const row = db.select().from(sessionTable).where(eq(sessionTable.id, tokenParts[0])).get();
	if (
		!row ||
		!constantTimeEqual(row.secretHash, hashSecret(tokenParts[1])) ||
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

export function invalidateUserPasswordResetSessions(userId: string): void {
	db.delete(sessionTable).where(eq(sessionTable.userId, userId)).run();
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
