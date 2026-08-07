import { dev } from '$app/env';
import type { RequestEvent } from '@sveltejs/kit';
import { and, eq, isNull, lt, or } from 'drizzle-orm';
import { TOTP_CODE_LENGTH } from '$lib/auth-constants';
import { decodeBase64url, encodeBase64url } from '$lib/encoding';
import { db } from '$lib/server/db';
import { totpCredential, user as userTable } from '$lib/server/db/schema';
import { decrypt, encrypt } from '$lib/server/auth/encryption';
import { ExpiringTokenBucket, RefillingTokenBucket } from '$lib/server/auth/rate-limit';
import { verifyTOTPKey } from '$lib/server/auth/totp-code';

export { createTOTPKeyURI, verifyTOTPKey } from '$lib/server/auth/totp-code';

const totpBucket = new ExpiringTokenBucket<string>('totp-verify', 5, 30 * 60);
export const totpUpdateBucket = new RefillingTokenBucket<string>('totp-update', 3, 10 * 60);

export function isTOTPCode(value: unknown): value is string {
	return typeof value === 'string' && value.length === TOTP_CODE_LENGTH && /^\d+$/.test(value);
}

export function generateTOTPKey(): Uint8Array {
	const key = new Uint8Array(20);
	crypto.getRandomValues(key);
	return key;
}

export function verifyUserTOTP(userId: string, code: string): TOTPVerificationResult {
	if (!totpBucket.consume(userId, 1)) return 'rate-limited';
	if (!verifyAndConsumeUserTOTP(userId, code)) return 'invalid';
	totpBucket.reset(userId);
	return 'valid';
}

function verifyAndConsumeUserTOTP(userId: string, code: string): boolean {
	const row = db
		.select({
			encryptedKey: totpCredential.encryptedKey,
			lastUsedCounter: totpCredential.lastUsedCounter
		})
		.from(totpCredential)
		.where(eq(totpCredential.userId, userId))
		.get();
	if (!row) {
		return false;
	}

	const counter = verifyTOTPKey(decrypt(row.encryptedKey), code);
	if (counter === null) {
		return false;
	}

	const consumed = db
		.update(totpCredential)
		.set({ lastUsedCounter: counter })
		.where(
			and(
				eq(totpCredential.userId, userId),
				eq(totpCredential.encryptedKey, row.encryptedKey),
				or(isNull(totpCredential.lastUsedCounter), lt(totpCredential.lastUsedCounter, counter))
			)
		)
		.returning({ userId: totpCredential.userId })
		.get();
	return consumed !== undefined;
}

type TOTPVerificationResult = 'valid' | 'invalid' | 'rate-limited';

export function updateUserTOTPKey(userId: string, key: Uint8Array, lastUsedCounter: number): void {
	const encryptedKey = encrypt(key);
	db.insert(totpCredential)
		.values({ userId, encryptedKey, lastUsedCounter })
		.onConflictDoUpdate({
			target: totpCredential.userId,
			set: { encryptedKey, lastUsedCounter }
		})
		.run();
}

export function deleteUserTOTP(userId: string): void {
	db.transaction((tx) => {
		tx.delete(totpCredential).where(eq(totpCredential.userId, userId)).run();
		tx.update(userTable).set({ recoveryCodeHash: null }).where(eq(userTable.id, userId)).run();
	});
}

export function setTOTPSetupCookie(event: RequestEvent, userId: string, key: Uint8Array): void {
	const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
	const payload = JSON.stringify({
		userId,
		key: encodeBase64url(key),
		expiresAt: expiresAt.getTime()
	});
	event.cookies.set('totp_setup', encodeBase64url(encrypt(new TextEncoder().encode(payload))), {
		httpOnly: true,
		path: '/api/auth/totp-setup',
		secure: !dev,
		sameSite: 'lax',
		expires: expiresAt
	});
}

export function getTOTPSetupKey(event: RequestEvent, userId: string): Uint8Array | null {
	const cookie = event.cookies.get('totp_setup');
	if (!cookie) {
		return null;
	}
	try {
		const payload = JSON.parse(
			new TextDecoder().decode(decrypt(decodeBase64url(cookie)))
		) as unknown;
		if (
			typeof payload !== 'object' ||
			payload === null ||
			!('userId' in payload) ||
			!('key' in payload) ||
			!('expiresAt' in payload) ||
			payload.userId !== userId ||
			typeof payload.key !== 'string' ||
			typeof payload.expiresAt !== 'number' ||
			payload.expiresAt <= Date.now()
		) {
			return null;
		}
		const key = decodeBase64url(payload.key);
		return key.byteLength === 20 ? key : null;
	} catch {
		return null;
	}
}

export function deleteTOTPSetupCookie(event: RequestEvent): void {
	event.cookies.delete('totp_setup', { path: '/api/auth/totp-setup' });
}
