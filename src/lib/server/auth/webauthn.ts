import { and, eq, isNull, lt, or } from 'drizzle-orm';
import { decodeBase64url, encodeBase64url } from '@oslojs/encoding';
import { db } from '$lib/server/db';
import { passkeyCredential, webAuthnChallenge } from '$lib/server/db/schema';
import { encodeHashedSecret } from '$lib/server/auth/utils';
import type { WebAuthnChallengePurpose } from '$lib/types/webauthn';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export function createWebAuthnChallenge(
	userId: string | null,
	purpose: WebAuthnChallengePurpose
): Uint8Array {
	const challenge = new Uint8Array(32);
	crypto.getRandomValues(challenge);
	const id = encodeHashedSecret(challenge);
	const now = new Date();
	db.transaction((tx) => {
		tx.delete(webAuthnChallenge)
			.where(
				or(
					lt(webAuthnChallenge.expiresAt, now),
					userId === null
						? and(eq(webAuthnChallenge.purpose, purpose), isNull(webAuthnChallenge.userId))
						: and(eq(webAuthnChallenge.purpose, purpose), eq(webAuthnChallenge.userId, userId))
				)
			)
			.run();
		tx.insert(webAuthnChallenge)
			.values({
				id,
				userId,
				purpose,
				expiresAt: new Date(now.getTime() + CHALLENGE_TTL_MS)
			})
			.run();
	});
	return challenge;
}

export function verifyWebAuthnChallenge(
	challenge: Uint8Array,
	userId: string | null,
	purpose: WebAuthnChallengePurpose
): boolean {
	const id = encodeHashedSecret(challenge);
	return db.transaction((tx) => {
		const row = tx.select().from(webAuthnChallenge).where(eq(webAuthnChallenge.id, id)).get();
		if (!row || row.expiresAt <= new Date() || row.userId !== userId || row.purpose !== purpose) {
			if (row) {
				tx.delete(webAuthnChallenge).where(eq(webAuthnChallenge.id, id)).run();
			}
			return false;
		}
		tx.delete(webAuthnChallenge).where(eq(webAuthnChallenge.id, id)).run();
		return true;
	});
}

export function getUserPasskeyCredentials(userId: string): WebAuthnUserCredential[] {
	return db
		.select()
		.from(passkeyCredential)
		.where(eq(passkeyCredential.userId, userId))
		.all()
		.map(toCredential);
}

export function getPasskeyCredential(credentialId: Uint8Array): WebAuthnUserCredential | null {
	const row = db
		.select()
		.from(passkeyCredential)
		.where(eq(passkeyCredential.id, encodeBase64url(credentialId)))
		.get();
	return row ? toCredential(row) : null;
}

export function getUserPasskeyCredential(
	userId: string,
	credentialId: Uint8Array
): WebAuthnUserCredential | null {
	const row = db
		.select()
		.from(passkeyCredential)
		.where(
			and(
				eq(passkeyCredential.id, encodeBase64url(credentialId)),
				eq(passkeyCredential.userId, userId)
			)
		)
		.get();
	return row ? toCredential(row) : null;
}

export function createPasskeyCredential(credential: WebAuthnUserCredential): void {
	db.insert(passkeyCredential)
		.values({
			id: encodeBase64url(credential.id),
			userId: credential.userId,
			name: credential.name,
			algorithm: credential.algorithmId,
			publicKey: Buffer.from(credential.publicKey),
			signCount: credential.signCount,
			createdAt: new Date()
		})
		.run();
}

export function updatePasskeyCounter(
	credentialId: Uint8Array,
	previousCounter: number,
	newCounter: number
): boolean {
	if (newCounter === 0 && previousCounter === 0) {
		return true;
	}
	if (newCounter <= previousCounter) {
		return false;
	}
	const result = db
		.update(passkeyCredential)
		.set({ signCount: newCounter })
		.where(
			and(
				eq(passkeyCredential.id, encodeBase64url(credentialId)),
				eq(passkeyCredential.signCount, previousCounter)
			)
		)
		.returning({ id: passkeyCredential.id })
		.get();
	return result !== undefined;
}

export function deleteUserPasskeyCredential(userId: string, credentialId: Uint8Array): boolean {
	const result = db
		.delete(passkeyCredential)
		.where(
			and(
				eq(passkeyCredential.id, encodeBase64url(credentialId)),
				eq(passkeyCredential.userId, userId)
			)
		)
		.returning({ id: passkeyCredential.id })
		.get();
	return result !== undefined;
}

function toCredential(row: typeof passkeyCredential.$inferSelect): WebAuthnUserCredential {
	return {
		id: decodeBase64url(row.id),
		userId: row.userId,
		name: row.name,
		algorithmId: row.algorithm,
		publicKey: row.publicKey,
		signCount: row.signCount
	};
}

export interface WebAuthnUserCredential {
	id: Uint8Array;
	userId: string;
	name: string;
	algorithmId: number;
	publicKey: Uint8Array;
	signCount: number;
}
