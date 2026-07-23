const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 255;
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
	return password.length >= MIN_PASSWORD_LENGTH && password.length <= MAX_PASSWORD_LENGTH;
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
