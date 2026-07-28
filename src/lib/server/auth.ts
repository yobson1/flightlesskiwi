import { dev } from '$app/env';
import type { RequestEvent } from '@sveltejs/kit';
import { and, eq, ne } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { session as sessionTable } from '$lib/server/db/schema';
import { getUserById, type AuthUser } from '$lib/server/auth/user';
import {
	constantTimeEqual,
	generateSecureRandomString,
	hashSecret,
	parseTwoPartToken
} from '$lib/server/auth/utils';

const DAY_IN_MS = 1000 * 60 * 60 * 24;
const INACTIVITY_TIMEOUT_MS = DAY_IN_MS * 30;
const ABSOLUTE_TIMEOUT_MS = DAY_IN_MS * 90;
const ACTIVITY_CHECK_INTERVAL_MS = 1000 * 60 * 60;
const REAUTHENTICATION_TTL_MS = 1000 * 60 * 5;

export const sessionCookieName = 'session';

function generateSessionToken(): string {
	return `${generateSecureRandomString()}.${generateSecureRandomString()}`;
}

function createSession(token: string, userId: string, flags: SessionFlags): Session {
	const tokenParts = parseTwoPartToken(token);
	if (tokenParts === null) {
		throw new Error('Invalid session token');
	}

	const now = new Date();
	const session: Session = {
		id: tokenParts.id,
		userId,
		createdAt: now,
		lastVerifiedAt: now,
		lastReauthenticatedAt: now,
		expiresAt: new Date(now.getTime() + INACTIVITY_TIMEOUT_MS),
		twoFactorVerified: flags.twoFactorVerified
	};

	db.insert(sessionTable)
		.values({
			id: session.id,
			userId,
			secretHash: hashSecret(tokenParts.secret),
			createdAt: now,
			lastVerifiedAt: now,
			lastReauthenticatedAt: now,
			twoFactorVerified: flags.twoFactorVerified
		})
		.run();

	return session;
}

export function createSessionAndSetCookie(
	event: RequestEvent,
	userId: string,
	flags: SessionFlags
): Session {
	const token = generateSessionToken();
	const session = createSession(token, userId, flags);
	setSessionTokenCookie(event, token, session.expiresAt);
	return session;
}

export function validateSessionToken(token: string): SessionValidationResult {
	const tokenParts = parseTwoPartToken(token);
	if (tokenParts === null) {
		return { session: null, user: null };
	}

	const row = db.select().from(sessionTable).where(eq(sessionTable.id, tokenParts.id)).get();
	if (!row || !constantTimeEqual(hashSecret(tokenParts.secret), row.secretHash)) {
		return { session: null, user: null };
	}

	const now = new Date();
	const inactivityExpiresAt = new Date(row.lastVerifiedAt.getTime() + INACTIVITY_TIMEOUT_MS);
	const absoluteExpiresAt = new Date(row.createdAt.getTime() + ABSOLUTE_TIMEOUT_MS);
	if (now >= inactivityExpiresAt || now >= absoluteExpiresAt) {
		invalidateSession(row.id);
		return { session: null, user: null };
	}

	const user = getUserById(row.userId);
	if (user === null) {
		invalidateSession(row.id);
		return { session: null, user: null };
	}
	if (user.registered2FA && !row.twoFactorVerified) {
		invalidateSession(row.id);
		return { session: null, user: null };
	}

	let lastVerifiedAt = row.lastVerifiedAt;
	if (now.getTime() - row.lastVerifiedAt.getTime() >= ACTIVITY_CHECK_INTERVAL_MS) {
		db.update(sessionTable)
			.set({ lastVerifiedAt: now })
			.where(and(eq(sessionTable.id, row.id), eq(sessionTable.lastVerifiedAt, row.lastVerifiedAt)))
			.run();
		lastVerifiedAt = now;
	}

	const expiresAt = new Date(
		Math.min(lastVerifiedAt.getTime() + INACTIVITY_TIMEOUT_MS, absoluteExpiresAt.getTime())
	);
	return {
		session: {
			id: row.id,
			userId: row.userId,
			createdAt: row.createdAt,
			lastVerifiedAt,
			lastReauthenticatedAt: row.lastReauthenticatedAt,
			expiresAt,
			twoFactorVerified: row.twoFactorVerified
		},
		user
	};
}

export function invalidateSession(sessionId: string): void {
	db.delete(sessionTable).where(eq(sessionTable.id, sessionId)).run();
}

export function setSessionAs2FAVerified(sessionId: string): void {
	db.update(sessionTable)
		.set({ twoFactorVerified: true, lastReauthenticatedAt: new Date() })
		.where(eq(sessionTable.id, sessionId))
		.run();
}

export function isSessionRecentlyReauthenticated(session: Session): boolean {
	return (
		session.lastReauthenticatedAt !== null &&
		Date.now() - session.lastReauthenticatedAt.getTime() <= REAUTHENTICATION_TTL_MS
	);
}

export function rotateSessionAfterReauthentication(
	event: RequestEvent,
	currentSession: Session
): Session {
	const currentToken = event.cookies.get(sessionCookieName);
	const currentTokenParts = currentToken ? parseTwoPartToken(currentToken) : null;
	if (currentTokenParts === null || currentTokenParts.id !== currentSession.id) {
		throw new Error('Current session token is unavailable');
	}

	const now = new Date();
	const newSecret = generateSecureRandomString();
	const rotated = db
		.update(sessionTable)
		.set({
			secretHash: hashSecret(newSecret),
			lastVerifiedAt: now,
			lastReauthenticatedAt: now
		})
		.where(
			and(
				eq(sessionTable.id, currentSession.id),
				eq(sessionTable.userId, currentSession.userId),
				eq(sessionTable.secretHash, hashSecret(currentTokenParts.secret))
			)
		)
		.returning({ id: sessionTable.id })
		.get();
	if (!rotated) {
		throw new Error('Current session could not be rotated');
	}

	const absoluteExpiresAt = new Date(currentSession.createdAt.getTime() + ABSOLUTE_TIMEOUT_MS);
	const expiresAt = new Date(
		Math.min(now.getTime() + INACTIVITY_TIMEOUT_MS, absoluteExpiresAt.getTime())
	);
	setSessionTokenCookie(event, `${currentSession.id}.${newSecret}`, expiresAt);

	return {
		...currentSession,
		lastVerifiedAt: now,
		lastReauthenticatedAt: now,
		expiresAt
	};
}

export function rotateSessionAfter2FAEnrollment(
	event: RequestEvent,
	currentSession: Session
): Session {
	const currentToken = event.cookies.get(sessionCookieName);
	const currentTokenParts = currentToken ? parseTwoPartToken(currentToken) : null;
	if (currentTokenParts === null || currentTokenParts.id !== currentSession.id) {
		throw new Error('Current session token is unavailable');
	}

	const now = new Date();
	const newSecret = generateSecureRandomString();
	const newSecretHash = hashSecret(newSecret);
	const currentSecretHash = hashSecret(currentTokenParts.secret);

	db.transaction((tx) => {
		const rotated = tx
			.update(sessionTable)
			.set({
				secretHash: newSecretHash,
				lastVerifiedAt: now,
				lastReauthenticatedAt: now,
				twoFactorVerified: true
			})
			.where(
				and(
					eq(sessionTable.id, currentSession.id),
					eq(sessionTable.userId, currentSession.userId),
					eq(sessionTable.secretHash, currentSecretHash)
				)
			)
			.returning({ id: sessionTable.id })
			.get();
		if (!rotated) {
			throw new Error('Current session could not be rotated');
		}

		tx.delete(sessionTable)
			.where(
				and(eq(sessionTable.userId, currentSession.userId), ne(sessionTable.id, currentSession.id))
			)
			.run();
	});

	const absoluteExpiresAt = new Date(currentSession.createdAt.getTime() + ABSOLUTE_TIMEOUT_MS);
	const expiresAt = new Date(
		Math.min(now.getTime() + INACTIVITY_TIMEOUT_MS, absoluteExpiresAt.getTime())
	);
	setSessionTokenCookie(event, `${currentSession.id}.${newSecret}`, expiresAt);

	return {
		...currentSession,
		lastVerifiedAt: now,
		lastReauthenticatedAt: now,
		expiresAt,
		twoFactorVerified: true
	};
}

export function setSessionTokenCookie(event: RequestEvent, token: string, expiresAt: Date): void {
	event.cookies.set(sessionCookieName, token, {
		httpOnly: true,
		path: '/',
		secure: !dev,
		sameSite: 'lax',
		expires: expiresAt
	});
}

export function deleteSessionTokenCookie(event: RequestEvent): void {
	event.cookies.delete(sessionCookieName, {
		httpOnly: true,
		path: '/',
		secure: !dev,
		sameSite: 'lax'
	});
}

export interface SessionFlags {
	twoFactorVerified: boolean;
}

export interface Session extends SessionFlags {
	id: string;
	userId: string;
	createdAt: Date;
	lastVerifiedAt: Date;
	lastReauthenticatedAt: Date | null;
	expiresAt: Date;
}

export type SessionValidationResult =
	{ session: Session; user: AuthUser } | { session: null; user: null };
