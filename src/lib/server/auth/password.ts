import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '$lib/auth-constants';
import * as v from 'valibot';

const passwordInputSchema = v.pipe(v.string(), v.nonEmpty(), v.maxLength(MAX_PASSWORD_LENGTH));
const strongPasswordSchema = v.pipe(
	v.string(),
	v.minLength(MIN_PASSWORD_LENGTH),
	v.maxLength(MAX_PASSWORD_LENGTH)
);

const ARGON2ID_OPTIONS = {
	algorithm: 'argon2id',
	memoryCost: 65_536,
	timeCost: 2
} as const;

export async function hashPassword(password: string): Promise<string> {
	return Bun.password.hash(password, ARGON2ID_OPTIONS);
}

export async function verifyPasswordHash(passwordHash: string, password: string): Promise<boolean> {
	return Bun.password.verify(password, passwordHash);
}

export function verifyPasswordStrength(password: string): boolean {
	return v.is(strongPasswordSchema, password);
}

export function parsePasswordInput(value: unknown): string | null {
	const result = v.safeParse(passwordInputSchema, value);
	return result.success ? result.output : null;
}

export async function hashRecoveryCode(recoveryCode: string): Promise<string> {
	return Bun.password.hash(normalizeRecoveryCode(recoveryCode), ARGON2ID_OPTIONS);
}

export async function verifyRecoveryCodeHash(
	recoveryCodeHash: string,
	recoveryCode: string
): Promise<boolean> {
	try {
		return await Bun.password.verify(normalizeRecoveryCode(recoveryCode), recoveryCodeHash);
	} catch {
		return false;
	}
}

function normalizeRecoveryCode(recoveryCode: string): string {
	return recoveryCode.trim().toUpperCase();
}
