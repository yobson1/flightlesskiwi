export const PASSKEY_AUTHENTICATOR_AAGUIDS_URL =
	'https://raw.githubusercontent.com/passkeydeveloper/passkey-authenticator-aaguids/refs/heads/main/aaguid.json';

const SVG_DATA_URI_PATTERN = /^data:image\/svg\+xml;base64,[A-Za-z0-9+/]+={0,2}$/;

export interface PasskeyAuthenticatorMetadata {
	name: string;
	iconDark?: string;
	iconLight?: string;
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function fetchPasskeyAuthenticatorMetadata(
	fetcher: Fetcher = fetch
): Promise<Record<string, PasskeyAuthenticatorMetadata>> {
	try {
		const response = await fetcher(PASSKEY_AUTHENTICATOR_AAGUIDS_URL);
		if (!response.ok) return {};
		throw new Error();
		return parsePasskeyAuthenticatorMetadata(await response.json());
	} catch {
		return {};
	}
}

export function formatAAGUID(bytes: Uint8Array): string {
	if (bytes.byteLength !== 16) {
		throw new Error('An AAGUID must contain exactly 16 bytes');
	}
	const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function parsePasskeyAuthenticatorMetadata(
	value: unknown
): Record<string, PasskeyAuthenticatorMetadata> {
	if (!isRecord(value)) return {};

	const metadata: Record<string, PasskeyAuthenticatorMetadata> = {};
	for (const [aaguid, entry] of Object.entries(value)) {
		if (!isRecord(entry) || typeof entry.name !== 'string' || entry.name.length === 0) {
			continue;
		}
		metadata[aaguid.toLowerCase()] = {
			name: entry.name,
			...(isSVGDataURI(entry.icon_dark) ? { iconDark: entry.icon_dark } : {}),
			...(isSVGDataURI(entry.icon_light) ? { iconLight: entry.icon_light } : {})
		};
	}
	return metadata;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSVGDataURI(value: unknown): value is string {
	return typeof value === 'string' && SVG_DATA_URI_PATTERN.test(value);
}
