import { dev } from '$app/env';
import type { RequestEvent } from '@sveltejs/kit';
import { decodeBase64url, encodeBase64url } from '$lib/encoding';
import { decryptToString, encryptString } from '$lib/server/auth/encryption';

const recoveryCodeCookieName = 'recovery_code_setup';
const RECOVERY_CODE_SETUP_TTL_SECONDS = 15 * 60;

export function getPendingRecoveryCode(event: RequestEvent, userId: string): string | null {
	const encoded = event.cookies.get(recoveryCodeCookieName);
	if (!encoded) return null;

	try {
		const payload = JSON.parse(decryptToString(decodeBase64url(encoded))) as PendingRecoveryCode;
		if (
			typeof payload !== 'object' ||
			payload === null ||
			payload.userId !== userId ||
			typeof payload.code !== 'string'
		) {
			deletePendingRecoveryCodeCookie(event);
			return null;
		}
		return payload.code;
	} catch {
		deletePendingRecoveryCodeCookie(event);
		return null;
	}
}

export function setPendingRecoveryCodeCookie(
	event: RequestEvent,
	userId: string,
	code: string
): void {
	const encrypted = encryptString(JSON.stringify({ userId, code } satisfies PendingRecoveryCode));
	event.cookies.set(recoveryCodeCookieName, encodeBase64url(encrypted), cookieAttributes());
}

export function deletePendingRecoveryCodeCookie(event: RequestEvent): void {
	event.cookies.delete(recoveryCodeCookieName, {
		httpOnly: true,
		path: '/api/auth/recovery-code',
		secure: !dev,
		sameSite: 'strict'
	});
}

function cookieAttributes() {
	return {
		httpOnly: true,
		path: '/api/auth/recovery-code',
		secure: !dev,
		sameSite: 'strict' as const,
		maxAge: RECOVERY_CODE_SETUP_TTL_SECONDS
	};
}

interface PendingRecoveryCode {
	userId: string;
	code: string;
}
