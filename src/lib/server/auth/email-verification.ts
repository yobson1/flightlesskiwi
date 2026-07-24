import { dev } from '$app/environment';
import type { RequestEvent } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { emailVerificationRequest as requestTable, user as userTable } from '$lib/server/db/schema';
import { EMAIL_CODE_TTL_MS } from '$lib/server/auth/email';
import { hashAuthCode } from '$lib/server/auth/encryption';
import {
	constantTimeEqual,
	generateRandomOTP,
	generateSecureRandomString
} from '$lib/server/auth/utils';

const cookieName = 'email_verification';

export function createEmailVerificationRequest(
	userId: string,
	email: string
): EmailVerificationRequestWithCode {
	const request = generateEmailVerificationRequest(userId, email);

	db.transaction((tx) => {
		tx.delete(requestTable).where(eq(requestTable.userId, userId)).run();
		tx.insert(requestTable).values(requestRow(request)).run();
	});
	return request;
}

export function createEmailChangeVerificationRequest(
	userId: string,
	email: string
): EmailVerificationRequestCreation {
	const request = generateEmailVerificationRequest(userId, email);
	return db.transaction((tx) => {
		const current = tx.select().from(requestTable).where(eq(requestTable.userId, userId)).get();
		if (current !== undefined && current.expiresAt.getTime() > Date.now()) {
			tx.update(userTable).set({ emailVerified: false }).where(eq(userTable.id, userId)).run();
			return { created: false, request: current };
		}

		tx.delete(requestTable).where(eq(requestTable.userId, userId)).run();
		tx.insert(requestTable).values(requestRow(request)).run();
		tx.update(userTable).set({ emailVerified: false }).where(eq(userTable.id, userId)).run();
		return { created: true, request };
	});
}

function generateEmailVerificationRequest(
	userId: string,
	email: string
): EmailVerificationRequestWithCode {
	const code = generateRandomOTP();
	return {
		id: generateSecureRandomString(),
		userId,
		email,
		code,
		codeHash: hashAuthCode(code),
		expiresAt: new Date(Date.now() + EMAIL_CODE_TTL_MS)
	};
}

function requestRow(request: EmailVerificationRequest) {
	return {
		id: request.id,
		userId: request.userId,
		email: request.email,
		codeHash: request.codeHash,
		expiresAt: request.expiresAt
	};
}

function getUserEmailVerificationRequestById(
	userId: string,
	id: string
): EmailVerificationRequest | null {
	const row = db
		.select()
		.from(requestTable)
		.where(and(eq(requestTable.id, id), eq(requestTable.userId, userId)))
		.get();
	return row ?? null;
}

export function getUserEmailVerificationRequest(userId: string): EmailVerificationRequest | null {
	const row = db.select().from(requestTable).where(eq(requestTable.userId, userId)).get();
	return row ?? null;
}

export function verifyEmailVerificationCode(
	request: EmailVerificationRequest,
	code: string
): boolean {
	return (
		Date.now() < request.expiresAt.getTime() &&
		constantTimeEqual(request.codeHash, hashAuthCode(code))
	);
}

export function cancelEmailChangeVerificationRequest(request: EmailVerificationRequest): void {
	db.transaction((tx) => {
		const deleted = tx
			.delete(requestTable)
			.where(and(eq(requestTable.id, request.id), eq(requestTable.userId, request.userId)))
			.returning({ id: requestTable.id })
			.get();
		if (deleted === undefined) return;
		tx.update(userTable).set({ emailVerified: true }).where(eq(userTable.id, request.userId)).run();
	});
}

export function setUserEmailAsUnverified(userId: string): boolean {
	const row = db
		.update(userTable)
		.set({ emailVerified: false })
		.where(eq(userTable.id, userId))
		.returning({ id: userTable.id })
		.get();
	return row !== undefined;
}

export function completeEmailVerificationRequest(request: EmailVerificationRequest): boolean {
	return db.transaction((tx) => {
		const current = tx
			.select({ email: requestTable.email })
			.from(requestTable)
			.where(and(eq(requestTable.id, request.id), eq(requestTable.userId, request.userId)))
			.get();
		if (current === undefined) return false;

		const user = tx
			.update(userTable)
			.set({ email: current.email, emailVerified: true })
			.where(eq(userTable.id, request.userId))
			.returning({ id: userTable.id })
			.get();
		if (user === undefined) return false;

		tx.delete(requestTable)
			.where(and(eq(requestTable.id, request.id), eq(requestTable.userId, request.userId)))
			.run();
		return true;
	});
}

export function setEmailVerificationRequestCookie(
	event: RequestEvent,
	request: EmailVerificationRequest
): void {
	event.cookies.set(cookieName, request.id, {
		httpOnly: true,
		path: '/',
		secure: !dev,
		sameSite: 'lax',
		expires: request.expiresAt
	});
}

export function deleteEmailVerificationRequestCookie(event: RequestEvent): void {
	event.cookies.delete(cookieName, { path: '/' });
}

export function getUserEmailVerificationRequestFromRequest(
	event: RequestEvent
): EmailVerificationRequest | null {
	if (event.locals.user === null) {
		return null;
	}
	const id = event.cookies.get(cookieName);
	const request =
		id === undefined
			? getUserEmailVerificationRequest(event.locals.user.id)
			: (getUserEmailVerificationRequestById(event.locals.user.id, id) ??
				getUserEmailVerificationRequest(event.locals.user.id));
	if (request === null) {
		deleteEmailVerificationRequestCookie(event);
	} else if (request.id !== id) {
		setEmailVerificationRequestCookie(event, request);
	}
	return request;
}

export interface EmailVerificationRequest {
	id: string;
	userId: string;
	email: string;
	codeHash: Buffer;
	expiresAt: Date;
}

export interface EmailVerificationRequestWithCode extends EmailVerificationRequest {
	code: string;
}

export type EmailVerificationRequestCreation =
	| { created: true; request: EmailVerificationRequestWithCode }
	| { created: false; request: EmailVerificationRequest };
