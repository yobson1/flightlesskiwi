import { dev } from '$app/environment';
import type { RequestEvent } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { emailVerificationRequest as requestTable } from '$lib/server/db/schema';
import { EMAIL_CODE_TTL_MS } from '$lib/server/auth/email';
import { hashAuthCode } from '$lib/server/auth/encryption';
import {
	constantTimeEqual,
	generateRandomOTP,
	generateSecureRandomString
} from '$lib/server/auth/utils';
import { ExpiringTokenBucket } from '$lib/server/auth/rate-limit';

const cookieName = 'email_verification';

export function createEmailVerificationRequest(
	userId: string,
	email: string
): EmailVerificationRequestWithCode {
	const code = generateRandomOTP();
	const request: EmailVerificationRequestWithCode = {
		id: generateSecureRandomString(),
		userId,
		email,
		code,
		codeHash: hashAuthCode(code),
		expiresAt: new Date(Date.now() + EMAIL_CODE_TTL_MS)
	};

	db.transaction((tx) => {
		tx.delete(requestTable).where(eq(requestTable.userId, userId)).run();
		tx.insert(requestTable)
			.values({
				id: request.id,
				userId,
				email,
				codeHash: request.codeHash,
				expiresAt: request.expiresAt
			})
			.run();
	});
	return request;
}

function getUserEmailVerificationRequest(
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

export function verifyEmailVerificationCode(
	request: EmailVerificationRequest,
	code: string
): boolean {
	return (
		Date.now() < request.expiresAt.getTime() &&
		constantTimeEqual(request.codeHash, hashAuthCode(code))
	);
}

export function deleteUserEmailVerificationRequest(userId: string): void {
	db.delete(requestTable).where(eq(requestTable.userId, userId)).run();
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
	if (!id) {
		return null;
	}
	const request = getUserEmailVerificationRequest(event.locals.user.id, id);
	if (request === null) {
		deleteEmailVerificationRequestCookie(event);
	}
	return request;
}

export const sendVerificationEmailBucket = new ExpiringTokenBucket<string>(
	'email-verification-send',
	3,
	EMAIL_CODE_TTL_MS / 1000
);

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
