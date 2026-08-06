import { Secret, TOTP } from 'otpauth';
import { TOTP_CODE_LENGTH } from '$lib/auth-constants';

const TOTP_INTERVAL_SECONDS = 30;

export function verifyTOTPKey(
	key: Uint8Array,
	code: string,
	timestamp: number = Date.now()
): number | null {
	const counter = TOTP.counter({ period: TOTP_INTERVAL_SECONDS, timestamp });
	const delta = TOTP.validate({
		token: code,
		secret: new Secret({ buffer: key.slice().buffer }),
		algorithm: 'SHA1',
		digits: TOTP_CODE_LENGTH,
		period: TOTP_INTERVAL_SECONDS,
		timestamp,
		window: 0
	});
	return delta === null ? null : counter + delta;
}

export function createTOTPKeyURI(issuer: string, accountName: string, key: Uint8Array): string {
	return new TOTP({
		issuer,
		label: accountName,
		secret: new Secret({ buffer: key.slice().buffer }),
		algorithm: 'SHA1',
		digits: TOTP_CODE_LENGTH,
		period: TOTP_INTERVAL_SECONDS
	}).toString();
}
