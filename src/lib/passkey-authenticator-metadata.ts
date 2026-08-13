import * as v from 'valibot';

export const PASSKEY_AUTHENTICATOR_AAGUIDS_URL =
	'https://raw.githubusercontent.com/passkeydeveloper/passkey-authenticator-aaguids/refs/heads/main/aaguid.json';

const SVG_DATA_URI_PATTERN = /^data:image\/svg\+xml;base64,[A-Za-z0-9+/]+={0,2}$/;
const passkeyAuthenticatorMetadataSchema = v.object({
	name: v.pipe(v.string(), v.nonEmpty()),
	icon_dark: v.optional(v.string()),
	icon_light: v.optional(v.string())
});
const passkeyAuthenticatorCatalogueSchema = v.pipe(
	v.record(v.string(), v.fallback(v.nullable(passkeyAuthenticatorMetadataSchema), null)),
	v.check((catalogue) => !Array.isArray(catalogue))
);
const svgDataURISchema = v.pipe(v.string(), v.regex(SVG_DATA_URI_PATTERN));

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
	const catalogue = v.safeParse(passkeyAuthenticatorCatalogueSchema, value);
	if (!catalogue.success) return {};

	const metadata: Record<string, PasskeyAuthenticatorMetadata> = {};
	for (const [aaguid, parsed] of Object.entries(catalogue.output)) {
		if (parsed === null) continue;
		metadata[aaguid.toLowerCase()] = {
			name: parsed.name,
			...(v.is(svgDataURISchema, parsed.icon_dark) ? { iconDark: parsed.icon_dark } : {}),
			...(v.is(svgDataURISchema, parsed.icon_light) ? { iconLight: parsed.icon_light } : {})
		};
	}
	return metadata;
}
