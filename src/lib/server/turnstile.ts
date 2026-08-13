import { ORIGIN, TURNSTILE_SECRET, TURNSTILE_SITE_KEY } from '$app/env/private';
import { TURNSTILE_ACTION } from '$lib/turnstile';
import { isNonArrayObject } from '$lib/utils';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export function isTurnstileEnabled(): boolean {
	return Boolean(TURNSTILE_SITE_KEY && TURNSTILE_SECRET);
}

export function getTurnstileSiteKey(): string | null {
	return isTurnstileEnabled() ? TURNSTILE_SITE_KEY! : null;
}

export async function verifyTurnstileToken(
	token: FormDataEntryValue | string | null,
	clientIp: string,
	fetcher: typeof fetch = fetch
): Promise<boolean> {
	if (!isTurnstileEnabled()) return true;
	if (typeof token !== 'string' || !token) return false;

	try {
		const response = await fetcher(SITEVERIFY_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				secret: TURNSTILE_SECRET!,
				response: token,
				remoteip: clientIp
			})
		});
		if (!response.ok) throw new Error(`siteverify ${response.status}`);
		const result = (await response.json()) as unknown;
		const expectedHostname = new URL(ORIGIN!).hostname;
		return (
			isNonArrayObject(result) &&
			'success' in result &&
			'action' in result &&
			'hostname' in result &&
			result.success === true &&
			result.action === TURNSTILE_ACTION &&
			result.hostname === expectedHostname
		);
	} catch {
		return false;
	}
}
