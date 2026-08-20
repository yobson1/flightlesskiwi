import { Secret, TOTP } from 'otpauth';
import { TOTP_CODE_LENGTH } from '#lib/auth-constants.js';

const TOTP_INTERVAL_SECONDS = 30;

export function verifyTOTPKey(
	key: Uint8Array,
	code: string,
	timestamp: number = Date.now()
): number | null {
	const totp = createTOTP(key);
	const counter = totp.counter({ timestamp });
	const delta = totp.validate({ token: code, timestamp, window: 0 });
	return delta === null ? null : counter + delta;
}

export function createTOTPKeyURI(issuer: string, accountName: string, key: Uint8Array): string {
	return createTOTP(key, { issuer, label: accountName }).toString();
}

function createTOTP(key: Uint8Array, account?: { issuer: string; label: string }): TOTP {
	return new TOTP({
		...account,
		secret: new Secret({ buffer: key.slice().buffer }),
		algorithm: 'SHA1',
		digits: TOTP_CODE_LENGTH,
		period: TOTP_INTERVAL_SECONDS
	});
}
