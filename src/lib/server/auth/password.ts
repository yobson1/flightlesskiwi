const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 255;

export async function hashPassword(password: string): Promise<string> {
	return Bun.password.hash(password, {
		algorithm: 'argon2id',
		memoryCost: 65_536,
		timeCost: 2
	});
}

export async function verifyPasswordHash(passwordHash: string, password: string): Promise<boolean> {
	return Bun.password.verify(password, passwordHash);
}

export function verifyPasswordStrength(password: string): boolean {
	return password.length >= MIN_PASSWORD_LENGTH && password.length <= MAX_PASSWORD_LENGTH;
}
