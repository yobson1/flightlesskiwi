import { and, eq } from 'drizzle-orm';
import { MAX_RECOVERY_CODE_LENGTH } from '#lib/auth-constants.js';
import { db } from '#lib/server/db/index.js';
import {
	loginAttempt,
	passkeyCredential,
	session,
	totpCredential,
	user as userTable
} from '#lib/server/db/schema.js';
import { verifyRecoveryCodeHash } from '#lib/server/auth/password.js';
import { ExpiringTokenBucket } from '#lib/server/auth/rate-limit.js';
import * as v from 'valibot';

const recoveryCodeBucket = new ExpiringTokenBucket<string>('recovery-code', 3, 60 * 60);
const recoveryCodeSchema = v.pipe(
	v.string(),
	v.maxLength(MAX_RECOVERY_CODE_LENGTH),
	v.check((value) => value.trim().length > 0)
);

export function parseRecoveryCode(value: unknown): string | null {
	const result = v.safeParse(recoveryCodeSchema, value);
	return result.success ? result.output : null;
}

export async function verifyUserRecoveryCode(
	userId: string,
	recoveryCode: string
): Promise<RecoveryCodeVerificationResult> {
	if (!recoveryCodeBucket.consume(userId, 1)) return 'rate-limited';
	if (!(await resetUser2FAWithRecoveryCode(userId, recoveryCode))) return 'invalid';
	recoveryCodeBucket.reset(userId);
	return 'valid';
}

async function resetUser2FAWithRecoveryCode(
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

type RecoveryCodeVerificationResult = 'valid' | 'invalid' | 'rate-limited';
