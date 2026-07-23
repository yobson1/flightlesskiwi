import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	loginAttempt,
	passkeyCredential,
	session,
	totpCredential,
	user as userTable
} from '$lib/server/db/schema';
import { verifyRecoveryCodeHash } from '$lib/server/auth/password';
import { ExpiringTokenBucket } from '$lib/server/auth/rate-limit';
import type { AuthUser } from '$lib/server/auth/user';

export const recoveryCodeBucket = new ExpiringTokenBucket<string>('recovery-code', 3, 60 * 60);

export async function resetUser2FAWithRecoveryCode(
	userId: string,
	recoveryCode: string
): Promise<boolean> {
	const row = db
		.select({ recoveryCodeHash: userTable.recoveryCodeHash })
		.from(userTable)
		.where(eq(userTable.id, userId))
		.get();
	if (
		!row?.recoveryCodeHash ||
		!(await verifyRecoveryCodeHash(row.recoveryCodeHash, recoveryCode))
	) {
		return false;
	}

	return db.transaction((tx) => {
		const consumed = tx
			.update(userTable)
			.set({ recoveryCodeHash: null })
			.where(and(eq(userTable.id, userId), eq(userTable.recoveryCodeHash, row.recoveryCodeHash!)))
			.returning({ id: userTable.id })
			.get();
		if (!consumed) {
			return false;
		}

		tx.delete(session).where(eq(session.userId, userId)).run();
		tx.delete(loginAttempt).where(eq(loginAttempt.userId, userId)).run();
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
