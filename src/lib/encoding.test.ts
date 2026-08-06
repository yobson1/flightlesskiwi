import { describe, expect, test } from 'bun:test';
import { decodeBase64, decodeBase64url, encodeBase64, encodeBase64url } from './encoding';

describe('native byte encoding', () => {
	test('round-trips standard base64', () => {
		const bytes = Uint8Array.from([0x00, 0x01, 0xfe, 0xff]);
		const encoded = encodeBase64(bytes);

		expect(encoded).toBe('AAH+/w==');
		expect(decodeBase64(encoded)).toEqual(bytes);
	});

	test('round-trips canonical unpadded base64url', () => {
		const bytes = Uint8Array.from([0x00, 0x01, 0xfe, 0xff]);
		const encoded = encodeBase64url(bytes);

		expect(encoded).toBe('AAH-_w');
		expect(decodeBase64url(encoded)).toEqual(bytes);
	});

	test('rejects malformed base64 input', () => {
		expect(() => decodeBase64('not base64')).toThrow();
		expect(() => decodeBase64url('AAH+/w==')).toThrow();
		expect(() => decodeBase64url('A')).toThrow();
	});
});
