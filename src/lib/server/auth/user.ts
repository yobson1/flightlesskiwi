import { and, eq, ne, sql } from 'drizzle-orm';
import { MAX_EMAIL_LENGTH, MAX_USERNAME_LENGTH, MIN_USERNAME_LENGTH } from '$lib/auth-constants';
import { db } from '$lib/server/db';
import {
	loginAttempt,
	passkeyCredential,
	session,
	totpCredential,
	user as userTable
} from '$lib/server/db/schema';
import { hashPassword, hashRecoveryCode } from '$lib/server/auth/password';
import { generateRandomRecoveryCode, generateSecureRandomString } from '$lib/server/auth/utils';

export function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

export function verifyEmailInput(email: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= MAX_EMAIL_LENGTH;
}

export function verifyUsernameInput(username: string): boolean {
	return (
		username.length >= MIN_USERNAME_LENGTH &&
		username.length <= MAX_USERNAME_LENGTH &&
		username.trim() === username &&
		/^[\p{L}\p{N}_ -]+$/u.test(username)
	);
}

export function checkEmailAvailability(email: string): boolean {
	return (
		db
			.select({ id: userTable.id })
			.from(userTable)
			.where(eq(userTable.email, normalizeEmail(email)))
			.get() === undefined
	);
}

export function checkUsernameAvailability(username: string, excludedUserId?: string): boolean {
	const predicate =
		excludedUserId === undefined
			? eq(userTable.username, username)
			: and(eq(userTable.username, username), ne(userTable.id, excludedUserId));
	return db.select({ id: userTable.id }).from(userTable).where(predicate).get() === undefined;
}

export function isUserUniqueConstraintError(cause: unknown, field: 'email' | 'username'): boolean {
	return String(cause).includes(`UNIQUE constraint failed: user.${field}`);
}

export function updateUserUsername(userId: string, username: string): boolean {
	const row = db
		.update(userTable)
		.set({ username })
		.where(eq(userTable.id, userId))
		.returning({ id: userTable.id })
		.get();
	return row !== undefined;
}

export function deleteUser(userId: string): boolean {
	const row = db
		.delete(userTable)
		.where(eq(userTable.id, userId))
		.returning({ id: userTable.id })
		.get();
	return row !== undefined;
}

export async function createUser(
	email: string,
	username: string,
	password: string
): Promise<AuthUser> {
	const id = generateSecureRandomString();
	const passwordHash = await hashPassword(password);
	const createdAt = new Date();

	db.insert(userTable)
		.values({
			id,
			email: normalizeEmail(email),
			username,
			passwordHash,
			recoveryCodeHash: null,
			emailVerified: false,
			createdAt
		})
		.run();

	return {
		id,
		email: normalizeEmail(email),
		username,
		emailVerified: false,
		registeredTOTP: false,
		registeredPasskey: false,
		registered2FA: false,
		recoveryCodeConfigured: false
	};
}

export function getUserById(userId: string): AuthUser | null {
	return getUser(eq(userTable.id, userId));
}

export function getUserFromEmail(email: string): AuthUser | null {
	return getUser(eq(userTable.email, normalizeEmail(email)));
}

function getUser(predicate: ReturnType<typeof eq>): AuthUser | null {
	const row = db
		.select({
			id: userTable.id,
			email: userTable.email,
			username: userTable.username,
			emailVerified: userTable.emailVerified,
			recoveryCodeHash: userTable.recoveryCodeHash,
			totpUserId: totpCredential.userId,
			passkeyId: passkeyCredential.id
		})
		.from(userTable)
		.leftJoin(totpCredential, eq(totpCredential.userId, userTable.id))
		.leftJoin(passkeyCredential, eq(passkeyCredential.userId, userTable.id))
		.where(predicate)
		.get();
	if (!row) {
		return null;
	}

	const registeredTOTP = row.totpUserId !== null;
	const registeredPasskey = row.passkeyId !== null;
	return {
		id: row.id,
		email: row.email,
		username: row.username,
		emailVerified: row.emailVerified,
		registeredTOTP,
		registeredPasskey,
		registered2FA: registeredTOTP || registeredPasskey,
		recoveryCodeConfigured: row.recoveryCodeHash !== null
	};
}

export function getUserPasswordHash(userId: string): string {
	const row = db
		.select({ passwordHash: userTable.passwordHash })
		.from(userTable)
		.where(eq(userTable.id, userId))
		.get();
	if (!row) {
		throw new Error('Invalid user ID');
	}
	return row.passwordHash;
}

export async function updateUserPassword(userId: string, password: string): Promise<void> {
	const passwordHash = await hashPassword(password);
	db.transaction((tx) => {
		tx.update(userTable).set({ passwordHash }).where(eq(userTable.id, userId)).run();
		tx.delete(session).where(eq(session.userId, userId)).run();
		tx.delete(loginAttempt).where(eq(loginAttempt.userId, userId)).run();
	});
}

export function setUserAsEmailVerifiedIfEmailMatches(userId: string, email: string): boolean {
	const result = db
		.update(userTable)
		.set({ emailVerified: true })
		.where(sql`${userTable.id} = ${userId} and ${userTable.email} = ${normalizeEmail(email)}`)
		.returning({ id: userTable.id })
		.get();
	return result !== undefined;
}

export async function resetUserRecoveryCode(userId: string): Promise<string> {
	const recoveryCode = generateRandomRecoveryCode();
	const recoveryCodeHash = await hashRecoveryCode(recoveryCode);
	db.update(userTable).set({ recoveryCodeHash }).where(eq(userTable.id, userId)).run();
	return recoveryCode;
}

export function setUserRecoveryCodeHash(userId: string, recoveryCodeHash: string): void {
	db.update(userTable).set({ recoveryCodeHash }).where(eq(userTable.id, userId)).run();
}

export interface AuthUser {
	id: string;
	email: string;
	username: string;
	emailVerified: boolean;
	registeredTOTP: boolean;
	registeredPasskey: boolean;
	registered2FA: boolean;
	recoveryCodeConfigured: boolean;
}
