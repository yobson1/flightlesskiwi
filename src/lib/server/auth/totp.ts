import { dev } from '$app/environment';
import type { RequestEvent } from '@sveltejs/kit';
import { decodeBase64url, encodeBase64url } from '@oslojs/encoding';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { totpCredential } from '$lib/server/db/schema';
import { decrypt, encrypt } from '$lib/server/auth/encryption';
import { ExpiringTokenBucket, RefillingTokenBucket } from '$lib/server/auth/rate-limit';

export const totpBucket = new ExpiringTokenBucket<string>('totp-verify', 5, 30 * 60);
export const totpUpdateBucket = new RefillingTokenBucket<string>('totp-update', 3, 10 * 60);

export function generateTOTPKey(): Uint8Array {
	const key = new Uint8Array(20);
	crypto.getRandomValues(key);
	return key;
}

export function getUserTOTPKey(userId: string): Uint8Array | null {
	const row = db
		.select({ encryptedKey: totpCredential.encryptedKey })
		.from(totpCredential)
		.where(eq(totpCredential.userId, userId))
		.get();
	return row ? decrypt(row.encryptedKey) : null;
}

export function updateUserTOTPKey(userId: string, key: Uint8Array): void {
	const encryptedKey = encrypt(key);
	db.insert(totpCredential)
		.values({ userId, encryptedKey })
		.onConflictDoUpdate({
			target: totpCredential.userId,
			set: { encryptedKey }
		})
		.run();
}

export function deleteUserTOTPKey(userId: string): void {
	db.delete(totpCredential).where(eq(totpCredential.userId, userId)).run();
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
		path: '/2fa/totp/setup',
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
	event.cookies.delete('totp_setup', { path: '/2fa/totp/setup' });
}
