export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 255;
export const MAX_EMAIL_LENGTH = 255;
export const MIN_USERNAME_LENGTH = 3;
export const MAX_USERNAME_LENGTH = 31;
export const EMAIL_CODE_LENGTH = 8;
export const TOTP_CODE_LENGTH = 6;
export const RECOVERY_CODE_LENGTH = 16;
export const MAX_RECOVERY_CODE_LENGTH = 64;
export const MAX_PASSKEY_NAME_LENGTH = 64;

const SMALL_NUMBER_WORDS = [
	'zero',
	'one',
	'two',
	'three',
	'four',
	'five',
	'six',
	'seven',
	'eight',
	'nine',
	'ten',
	'eleven',
	'twelve',
	'thirteen',
	'fourteen',
	'fifteen',
	'sixteen',
	'seventeen',
	'eighteen',
	'nineteen',
	'twenty'
] as const;

function numberWord(value: number): string {
	return SMALL_NUMBER_WORDS[value] ?? String(value);
}

export const EMAIL_CODE_LENGTH_WORD = numberWord(EMAIL_CODE_LENGTH);
export const TOTP_CODE_LENGTH_WORD = numberWord(TOTP_CODE_LENGTH);
