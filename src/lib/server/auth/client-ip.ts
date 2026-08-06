import { CLIENT_IP_HEADER, TRUSTED_PROXY_ADDRESS } from '$app/env/private';
import type { RequestEvent } from '@sveltejs/kit';

export function getClientIP(event: RequestEvent): string {
	let directAddress: string;
	try {
		directAddress = event.getClientAddress();
	} catch {
		return 'unknown';
	}

	if (CLIENT_IP_HEADER && directAddress === TRUSTED_PROXY_ADDRESS) {
		const forwardedAddress = event.request.headers.get(CLIENT_IP_HEADER)?.trim();
		if (forwardedAddress) return forwardedAddress;
	}

	return directAddress;
}
