import { TURNSTILE_SECRET, TURNSTILE_SITE_KEY } from '$app/env/private';

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
		const result = (await response.json()) as { success?: unknown };
		return result.success === true;
	} catch {
		return false;
	}
}
