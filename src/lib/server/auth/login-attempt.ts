import { dev } from '$app/env';
import type { RequestEvent } from '@sveltejs/kit';
import { eq, lt } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { loginAttempt as loginAttemptTable } from '#lib/server/db/schema.js';
import { getUserById, type AuthUser } from '#lib/server/auth/user.js';
import {
	constantTimeEqual,
	generateSecureRandomString,
	hashSecret,
	parseTwoPartToken
} from '#lib/server/auth/utils.js';

const LOGIN_ATTEMPT_TTL_MS = 5 * 60 * 1000;
const cookieName = 'login_attempt';

export function createLoginAttempt(event: RequestEvent, userId: string): LoginAttempt {
	const id = generateSecureRandomString();
	const secret = generateSecureRandomString();
	const expiresAt = new Date(Date.now() + LOGIN_ATTEMPT_TTL_MS);

	db.transaction((tx) => {
		tx.delete(loginAttemptTable).where(lt(loginAttemptTable.expiresAt, new Date())).run();
		tx.insert(loginAttemptTable)
			.values({
				id,
				userId,
				secretHash: hashSecret(secret),
				expiresAt
			})
			.run();
	});

	event.cookies.set(cookieName, `${id}.${secret}`, {
		httpOnly: true,
		path: '/api',
		secure: !dev,
		sameSite: 'lax',
		expires: expiresAt
	});

	return { id, userId, expiresAt };
}

export function validateLoginAttemptRequest(event: RequestEvent): LoginAttemptValidationResult {
	const token = event.cookies.get(cookieName);
	if (!token) {
		return { attempt: null, user: null };
	}

	const attempt = validateLoginAttemptToken(token);
	if (attempt === null) {
		deleteLoginAttemptCookie(event);
		return { attempt: null, user: null };
	}

	const user = getUserById(attempt.userId);
	if (user === null) {
		invalidateLoginAttempt(attempt.id);
		deleteLoginAttemptCookie(event);
		return { attempt: null, user: null };
	}

	return { attempt, user };
}

export function consumeLoginAttemptRequest(event: RequestEvent, attemptId: string): boolean {
	const token = event.cookies.get(cookieName);
	const tokenParts = token ? parseTwoPartToken(token) : null;
	if (tokenParts === null || tokenParts.id !== attemptId) {
		deleteLoginAttemptCookie(event);
		return false;
	}

	const consumed = db.transaction((tx) => {
		const row = tx
			.select()
			.from(loginAttemptTable)
			.where(eq(loginAttemptTable.id, tokenParts.id))
			.get();
		if (
			!row ||
			row.expiresAt <= new Date() ||
			!constantTimeEqual(row.secretHash, hashSecret(tokenParts.secret))
		) {
			if (row?.expiresAt && row.expiresAt <= new Date()) {
				tx.delete(loginAttemptTable).where(eq(loginAttemptTable.id, row.id)).run();
			}
			return false;
		}

		tx.delete(loginAttemptTable).where(eq(loginAttemptTable.id, row.id)).run();
		return true;
	});

	deleteLoginAttemptCookie(event);
	return consumed;
}

export function invalidateLoginAttemptRequest(event: RequestEvent): void {
	const token = event.cookies.get(cookieName);
	const tokenParts = token ? parseTwoPartToken(token) : null;
	if (tokenParts !== null) {
		const row = db
			.select({ secretHash: loginAttemptTable.secretHash })
			.from(loginAttemptTable)
			.where(eq(loginAttemptTable.id, tokenParts.id))
			.get();
		if (row && constantTimeEqual(row.secretHash, hashSecret(tokenParts.secret))) {
			invalidateLoginAttempt(tokenParts.id);
		}
	}
	deleteLoginAttemptCookie(event);
}

function validateLoginAttemptToken(token: string): LoginAttempt | null {
	const tokenParts = parseTwoPartToken(token);
	if (tokenParts === null) {
		return null;
	}

	const row = db
		.select()
		.from(loginAttemptTable)
		.where(eq(loginAttemptTable.id, tokenParts.id))
		.get();
	if (
		!row ||
		!constantTimeEqual(row.secretHash, hashSecret(tokenParts.secret)) ||
		row.expiresAt <= new Date()
	) {
		if (row?.expiresAt && row.expiresAt <= new Date()) {
			invalidateLoginAttempt(row.id);
		}
		return null;
	}

	return {
		id: row.id,
		userId: row.userId,
		expiresAt: row.expiresAt
	};
}

function invalidateLoginAttempt(attemptId: string): void {
	db.delete(loginAttemptTable).where(eq(loginAttemptTable.id, attemptId)).run();
}

function deleteLoginAttemptCookie(event: RequestEvent): void {
	event.cookies.delete(cookieName, {
		httpOnly: true,
		path: '/api',
		secure: !dev,
		sameSite: 'lax'
	});
}

export interface LoginAttempt {
	id: string;
	userId: string;
	expiresAt: Date;
}

type LoginAttemptValidationResult =
	| { attempt: LoginAttempt; user: AuthUser }
	| { attempt: null; user: null };
