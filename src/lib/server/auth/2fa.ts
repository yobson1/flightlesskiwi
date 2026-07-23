import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	passkeyCredential,
	session,
	totpCredential,
	user as userTable
} from '$lib/server/db/schema';
import { decryptToString, encryptString } from '$lib/server/auth/encryption';
import { ExpiringTokenBucket } from '$lib/server/auth/rate-limit';
import { constantTimeEqual, generateRandomRecoveryCode } from '$lib/server/auth/utils';
import type { AuthUser } from '$lib/server/auth/user';

export const recoveryCodeBucket = new ExpiringTokenBucket<string>('recovery-code', 3, 60 * 60);

export function resetUser2FAWithRecoveryCode(userId: string, recoveryCode: string): boolean {
	return db.transaction((tx) => {
		const row = tx
			.select({ recoveryCode: userTable.recoveryCode })
			.from(userTable)
			.where(eq(userTable.id, userId))
			.get();
		if (!row) {
			return false;
		}
		const expected = new TextEncoder().encode(decryptToString(row.recoveryCode));
		const actual = new TextEncoder().encode(recoveryCode);
		if (!constantTimeEqual(expected, actual)) {
			return false;
		}

		tx.update(userTable)
			.set({ recoveryCode: encryptString(generateRandomRecoveryCode()) })
			.where(eq(userTable.id, userId))
			.run();
		tx.update(session).set({ twoFactorVerified: false }).where(eq(session.userId, userId)).run();
		tx.delete(totpCredential).where(eq(totpCredential.userId, userId)).run();
		tx.delete(passkeyCredential).where(eq(passkeyCredential.userId, userId)).run();
		return true;
	});
}

export function get2FARedirect(user: AuthUser): string {
	if (user.registeredTOTP) {
		return '/2fa/totp';
	}
	if (user.registeredPasskey) {
		return '/2fa/passkey';
	}
	return '/2fa/setup';
}

export function getPasswordReset2FARedirect(user: AuthUser): string {
	if (user.registeredTOTP) {
		return '/reset-password/2fa/totp';
	}
	if (user.registeredPasskey) {
		return '/reset-password/2fa/passkey';
	}
	return '/reset-password';
}
