import type { RequestEvent } from '@sveltejs/kit';
import { decodeBase64 } from '@oslojs/encoding';

export function getClientIP(event: RequestEvent): string {
	try {
		return event.getClientAddress();
	} catch {
		return 'unknown';
	}
}

export async function parseAssertionRequest(request: Request): Promise<ParsedAssertion | null> {
	let data: unknown;
	try {
		data = await request.json();
	} catch {
		return null;
	}
	if (!isRecord(data)) {
		return null;
	}
	const authenticatorData = data.authenticator_data;
	const clientDataJSON = data.client_data_json;
	const credentialId = data.credential_id;
	const signature = data.signature;
	if (
		typeof authenticatorData !== 'string' ||
		typeof clientDataJSON !== 'string' ||
		typeof credentialId !== 'string' ||
		typeof signature !== 'string'
	) {
		return null;
	}
	try {
		return {
			authenticatorData: decodeBase64(authenticatorData),
			clientDataJSON: decodeBase64(clientDataJSON),
			credentialId: decodeBase64(credentialId),
			signature: decodeBase64(signature)
		};
	} catch {
		return null;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface ParsedAssertion {
	authenticatorData: Uint8Array;
	clientDataJSON: Uint8Array;
	credentialId: Uint8Array;
	signature: Uint8Array;
}
