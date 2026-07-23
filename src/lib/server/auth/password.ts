import { hash, verify } from '@node-rs/argon2';

const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 255;

export async function hashPassword(password: string): Promise<string> {
	return hash(password, {
		// @node-rs/argon2's ambient const enum cannot be imported with
		// verbatimModuleSyntax. 2 is its documented Argon2id value.
		algorithm: 2,
		memoryCost: 19_456,
		timeCost: 2,
		outputLen: 32,
		parallelism: 1
	});
}

export async function verifyPasswordHash(passwordHash: string, password: string): Promise<boolean> {
	return verify(passwordHash, password);
}

export function verifyPasswordStrength(password: string): boolean {
	return password.length >= MIN_PASSWORD_LENGTH && password.length <= MAX_PASSWORD_LENGTH;
}
