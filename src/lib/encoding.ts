export function encodeBase64(value: Uint8Array): string {
	return value.toBase64();
}

export function decodeBase64(value: string): Uint8Array {
	return Uint8Array.fromBase64(value, { lastChunkHandling: 'strict' });
}

export function encodeBase64url(value: Uint8Array): string {
	return value.toBase64({ alphabet: 'base64url', omitPadding: true });
}

export function decodeBase64url(value: string): Uint8Array {
	if (!/^[A-Za-z0-9_-]*$/.test(value) || value.length % 4 === 1) {
		throw new SyntaxError('Invalid base64url value');
	}
	return Uint8Array.fromBase64(value.padEnd(Math.ceil(value.length / 4) * 4, '='), {
		alphabet: 'base64url',
		lastChunkHandling: 'strict'
	});
}
