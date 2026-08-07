import { and, eq, ne, sql } from 'drizzle-orm';
import { MAX_EMAIL_LENGTH, MAX_USERNAME_LENGTH, MIN_USERNAME_LENGTH } from '$lib/auth-constants';
import { db } from '$lib/server/db';
import {
	emailVerificationRequest,
	loginAttempt,
	oauthAccount,
	passkeyCredential,
	session,
	totpCredential,
	user as userTable
} from '$lib/server/db/schema';
import { decryptToString, encryptString } from '$lib/server/auth/encryption';
import { hashPassword, hashRecoveryCode } from '$lib/server/auth/password';
import { generateRandomRecoveryCode, generateSecureRandomString } from '$lib/server/auth/utils';
import type { OAuthTokenSet, OAuthUserProfile } from '$lib/server/oauth';
import { canRemoveOAuthConnection, type OAuthProvider } from '$lib/types/oauth';

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
		hasPassword: true,
		registeredTOTP: false,
		registeredPasskey: false,
		registered2FA: false,
		recoveryCodeConfigured: false,
		oauthProviders: []
	};
}

export function getUserFromOAuthAccount(
	provider: OAuthProvider,
	providerUserId: string
): AuthUser | null {
	const account = db
		.select({ userId: oauthAccount.userId })
		.from(oauthAccount)
		.where(
			and(eq(oauthAccount.provider, provider), eq(oauthAccount.providerUserId, providerUserId))
		)
		.get();
	return account ? getUserById(account.userId) : null;
}

export function createOrLinkOAuthUser(
	provider: OAuthProvider,
	profile: OAuthUserProfile,
	tokens: OAuthTokenSet
): AuthUser {
	const email = normalizeEmail(profile.email);
	if (!profile.id || !profile.emailVerified || !verifyEmailInput(email)) {
		throw new Error('OAuth provider did not return a verified email');
	}

	const encryptedTokens = encryptOAuthTokens(tokens);
	const userId = db.transaction((tx) => {
		const linked = tx
			.select({ userId: oauthAccount.userId })
			.from(oauthAccount)
			.where(and(eq(oauthAccount.provider, provider), eq(oauthAccount.providerUserId, profile.id)))
			.get();
		if (linked) {
			tx.update(oauthAccount)
				.set(encryptedTokens)
				.where(
					and(eq(oauthAccount.provider, provider), eq(oauthAccount.providerUserId, profile.id))
				)
				.run();
			return linked.userId;
		}

		const existingUser = tx
			.select({ id: userTable.id })
			.from(userTable)
			.where(eq(userTable.email, email))
			.get();
		const id = existingUser?.id ?? generateSecureRandomString();
		if (existingUser) {
			tx.update(userTable).set({ emailVerified: true }).where(eq(userTable.id, id)).run();
			tx.delete(emailVerificationRequest).where(eq(emailVerificationRequest.userId, id)).run();
		} else {
			tx.insert(userTable)
				.values({
					id,
					email,
					username: createOAuthUsername(profile.username, provider),
					passwordHash: null,
					recoveryCodeHash: null,
					emailVerified: true,
					createdAt: new Date()
				})
				.run();
		}

		tx.insert(oauthAccount)
			.values({
				provider,
				providerUserId: profile.id,
				...encryptedTokens,
				userId: id,
				createdAt: new Date()
			})
			.run();
		return id;
	});

	const user = getUserById(userId);
	if (user === null) throw new Error('OAuth user could not be loaded');
	return user;
}

export function linkUserOAuthAccount(
	userId: string,
	provider: OAuthProvider,
	providerUserId: string,
	tokens: OAuthTokenSet
): 'linked' | 'already-linked' | 'provider-in-use' | 'provider-connected' | 'user-not-found' {
	const encryptedTokens = encryptOAuthTokens(tokens);
	return db.transaction((tx) => {
		const user = tx
			.select({ id: userTable.id })
			.from(userTable)
			.where(eq(userTable.id, userId))
			.get();
		if (user === undefined) return 'user-not-found';

		const linkedIdentity = tx
			.select({ userId: oauthAccount.userId })
			.from(oauthAccount)
			.where(
				and(eq(oauthAccount.provider, provider), eq(oauthAccount.providerUserId, providerUserId))
			)
			.get();
		if (linkedIdentity !== undefined) {
			if (linkedIdentity.userId !== userId) return 'provider-in-use';
			tx.update(oauthAccount)
				.set(encryptedTokens)
				.where(
					and(eq(oauthAccount.provider, provider), eq(oauthAccount.providerUserId, providerUserId))
				)
				.run();
			return 'already-linked';
		}

		const existingProvider = tx
			.select({ providerUserId: oauthAccount.providerUserId })
			.from(oauthAccount)
			.where(and(eq(oauthAccount.userId, userId), eq(oauthAccount.provider, provider)))
			.get();
		if (existingProvider !== undefined) return 'provider-connected';

		tx.insert(oauthAccount)
			.values({ provider, providerUserId, ...encryptedTokens, userId, createdAt: new Date() })
			.run();
		return 'linked';
	});
}

export function deleteUserOAuthAccount(
	userId: string,
	provider: OAuthProvider
): DeleteUserOAuthAccountResult {
	return db.transaction((tx) => {
		const account = tx
			.select({
				encryptedAccessToken: oauthAccount.encryptedAccessToken,
				encryptedRefreshToken: oauthAccount.encryptedRefreshToken
			})
			.from(oauthAccount)
			.where(and(eq(oauthAccount.userId, userId), eq(oauthAccount.provider, provider)))
			.get();
		if (account === undefined) return { status: 'not-found' };

		const user = tx
			.select({ passwordHash: userTable.passwordHash })
			.from(userTable)
			.where(eq(userTable.id, userId))
			.get();
		if (user === undefined) return { status: 'not-found' };
		const oauthAccounts = tx
			.select({ provider: oauthAccount.provider })
			.from(oauthAccount)
			.where(eq(oauthAccount.userId, userId))
			.all();
		if (!canRemoveOAuthConnection(user.passwordHash !== null, oauthAccounts.length)) {
			return { status: 'last-sign-in-method' };
		}

		const tokens = decryptOAuthTokens(account);

		tx.delete(oauthAccount)
			.where(and(eq(oauthAccount.userId, userId), eq(oauthAccount.provider, provider)))
			.run();
		return { status: 'deleted', tokens };
	});
}

export function getUserOAuthAuthorizations(userId: string): OAuthAuthorization[] {
	return db
		.select({
			provider: oauthAccount.provider,
			encryptedAccessToken: oauthAccount.encryptedAccessToken,
			encryptedRefreshToken: oauthAccount.encryptedRefreshToken
		})
		.from(oauthAccount)
		.where(eq(oauthAccount.userId, userId))
		.all()
		.map((account) => ({
			provider: account.provider,
			tokens: decryptOAuthTokens(account)
		}));
}

export function updateUserOAuthAccountTokens(
	userId: string,
	provider: OAuthProvider,
	providerUserId: string,
	tokens: OAuthTokenSet
): boolean {
	const row = db
		.update(oauthAccount)
		.set(encryptOAuthTokens(tokens))
		.where(
			and(
				eq(oauthAccount.userId, userId),
				eq(oauthAccount.provider, provider),
				eq(oauthAccount.providerUserId, providerUserId)
			)
		)
		.returning({ providerUserId: oauthAccount.providerUserId })
		.get();
	return row !== undefined;
}

function encryptOAuthTokens(tokens: OAuthTokenSet): EncryptedOAuthTokens {
	return {
		encryptedAccessToken: encryptString(tokens.accessToken),
		encryptedRefreshToken: tokens.refreshToken === null ? null : encryptString(tokens.refreshToken)
	};
}

function decryptOAuthTokens(tokens: StoredEncryptedOAuthTokens): OAuthTokenSet | null {
	if (tokens.encryptedAccessToken === null) return null;
	try {
		return {
			accessToken: decryptToString(tokens.encryptedAccessToken),
			refreshToken:
				tokens.encryptedRefreshToken === null ? null : decryptToString(tokens.encryptedRefreshToken)
		};
	} catch {
		return null;
	}
}

interface EncryptedOAuthTokens {
	encryptedAccessToken: Buffer;
	encryptedRefreshToken: Buffer | null;
}

interface StoredEncryptedOAuthTokens {
	encryptedAccessToken: Buffer | null;
	encryptedRefreshToken: Buffer | null;
}

export interface OAuthAuthorization {
	provider: OAuthProvider;
	tokens: OAuthTokenSet | null;
}

export type DeleteUserOAuthAccountResult =
	| { status: 'deleted'; tokens: OAuthTokenSet | null }
	| { status: 'not-found' }
	| { status: 'last-sign-in-method' };

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
			passwordHash: userTable.passwordHash,
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
	const oauthProviders = db
		.select({ provider: oauthAccount.provider })
		.from(oauthAccount)
		.where(eq(oauthAccount.userId, row.id))
		.all()
		.map((account) => account.provider);
	return {
		id: row.id,
		email: row.email,
		username: row.username,
		emailVerified: row.emailVerified,
		hasPassword: row.passwordHash !== null,
		registeredTOTP,
		registeredPasskey,
		registered2FA: registeredTOTP || registeredPasskey,
		recoveryCodeConfigured: row.recoveryCodeHash !== null,
		oauthProviders
	};
}

export function getUserPasswordHash(userId: string): string | null {
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
	hasPassword: boolean;
	registeredTOTP: boolean;
	registeredPasskey: boolean;
	registered2FA: boolean;
	recoveryCodeConfigured: boolean;
	oauthProviders: OAuthProvider[];
}

function createOAuthUsername(suggestedUsername: string, provider: OAuthProvider): string {
	let base = suggestedUsername
		.normalize('NFKC')
		.replace(/[^\p{L}\p{N}_ -]+/gu, '')
		.replace(/\s+/g, ' ')
		.trim();
	if (base.length < MIN_USERNAME_LENGTH) base = `${provider} user`;
	base = base.slice(0, MAX_USERNAME_LENGTH).trim();

	for (let suffix = 1; ; suffix++) {
		const suffixText = suffix === 1 ? '' : ` ${suffix}`;
		const candidate = `${base.slice(0, MAX_USERNAME_LENGTH - suffixText.length).trim()}${suffixText}`;
		if (checkUsernameAvailability(candidate)) return candidate;
	}
}
