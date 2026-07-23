import { dev } from '$app/environment';
import type { RequestEvent } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { session as sessionTable } from '$lib/server/db/schema';
import { getUserById, type AuthUser } from '$lib/server/auth/user';
import { constantTimeEqual, generateSecureRandomString, hashSecret } from '$lib/server/auth/utils';

const DAY_IN_MS = 1000 * 60 * 60 * 24;
const INACTIVITY_TIMEOUT_MS = DAY_IN_MS * 30;
const ABSOLUTE_TIMEOUT_MS = DAY_IN_MS * 90;
const ACTIVITY_CHECK_INTERVAL_MS = 1000 * 60 * 60;

export const sessionCookieName = 'session';

export function generateSessionToken(): string {
	return `${generateSecureRandomString()}.${generateSecureRandomString()}`;
}

export function createSession(token: string, userId: string, flags: SessionFlags): Session {
	const tokenParts = parseSessionToken(token);
	if (tokenParts === null) {
		throw new Error('Invalid session token');
	}

	const now = new Date();
	const session: Session = {
		id: tokenParts.id,
		userId,
		createdAt: now,
		lastVerifiedAt: now,
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
			twoFactorVerified: flags.twoFactorVerified
		})
		.run();

	return session;
}

export function validateSessionToken(token: string): SessionValidationResult {
	const tokenParts = parseSessionToken(token);
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
			expiresAt,
			twoFactorVerified: row.twoFactorVerified
		},
		user
	};
}

export function invalidateSession(sessionId: string): void {
	db.delete(sessionTable).where(eq(sessionTable.id, sessionId)).run();
}

export function invalidateUserSessions(userId: string): void {
	db.delete(sessionTable).where(eq(sessionTable.userId, userId)).run();
}

export function setSessionAs2FAVerified(sessionId: string): void {
	db.update(sessionTable)
		.set({ twoFactorVerified: true })
		.where(eq(sessionTable.id, sessionId))
		.run();
}

export function isSessionFullyAuthenticated(
	user: AuthUser | null,
	session: Session | null
): boolean {
	return (
		user !== null &&
		session !== null &&
		user.emailVerified &&
		(!user.registered2FA || session.twoFactorVerified)
	);
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

function parseSessionToken(token: string): { id: string; secret: string } | null {
	const tokenParts = token.split('.');
	if (tokenParts.length !== 2 || !tokenParts[0] || !tokenParts[1]) {
		return null;
	}
	return { id: tokenParts[0], secret: tokenParts[1] };
}

export interface SessionFlags {
	twoFactorVerified: boolean;
}

export interface Session extends SessionFlags {
	id: string;
	userId: string;
	createdAt: Date;
	lastVerifiedAt: Date;
	expiresAt: Date;
}

export type SessionValidationResult =
	{ session: Session; user: AuthUser } | { session: null; user: null };
