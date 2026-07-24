import { describe, expect, test } from 'bun:test';
import {
	fetchPasskeyAuthenticatorMetadata,
	formatAAGUID
} from '$lib/passkey-authenticator-metadata';

describe('passkey authenticator metadata', () => {
	test('formats AAGUID bytes as a lowercase UUID', () => {
		expect(
			formatAAGUID(
				Uint8Array.from([
					0xa1, 0x1a, 0x5f, 0xaa, 0x9f, 0x32, 0x4b, 0x8c, 0x8c, 0x5d, 0x2f, 0x7d, 0x13, 0xe8, 0xc9,
					0x42
				])
			)
		).toBe('a11a5faa-9f32-4b8c-8c5d-2f7d13e8c942');
	});

	test('loads names and valid optional SVG icons', async () => {
		const icon = 'data:image/svg+xml;base64,PHN2Zy8+';
		const fetcher = async () =>
			new Response(
				JSON.stringify({
					'A11A5FAA-9F32-4B8C-8C5D-2F7D13E8C942': {
						name: 'AliasVault',
						icon_dark: icon,
						icon_light: 'https://example.com/icon.svg'
					}
				})
			);

		expect(await fetchPasskeyAuthenticatorMetadata(fetcher)).toEqual({
			'a11a5faa-9f32-4b8c-8c5d-2f7d13e8c942': {
				name: 'AliasVault',
				iconDark: icon
			}
		});
	});

	test('falls back to an empty catalogue when fetching fails', async () => {
		const fetcher = async () => {
			throw new Error('offline');
		};
		expect(await fetchPasskeyAuthenticatorMetadata(fetcher)).toEqual({});
	});
});
