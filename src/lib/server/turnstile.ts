import { ORIGIN, TURNSTILE_SECRET, TURNSTILE_SITE_KEY } from '$app/env/private';
import { TURNSTILE_ACTION } from '$lib/turnstile';
import * as v from 'valibot';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const turnstileSuccessSchema = v.object({
	success: v.literal(true),
	action: v.literal(TURNSTILE_ACTION),
	hostname: v.string()
});
type TurnstileFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function hasTurnstileConfiguration(): boolean {
	return Boolean(TURNSTILE_SITE_KEY && TURNSTILE_SECRET);
}

export function getTurnstileSiteKey(): string | null {
	return hasTurnstileConfiguration() ? TURNSTILE_SITE_KEY! : null;
}

export async function verifyTurnstileToken(
	token: FormDataEntryValue | string | null,
	clientIp: string,
	fetcher: TurnstileFetcher = fetch
): Promise<boolean> {
	if (!hasTurnstileConfiguration()) return true;
	const tokenResult = v.safeParse(v.pipe(v.string(), v.nonEmpty()), token);
	if (!tokenResult.success) return false;

	try {
		const response = await fetcher(SITEVERIFY_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				secret: TURNSTILE_SECRET!,
				response: tokenResult.output,
				remoteip: clientIp
			})
		});
		if (!response.ok) throw new Error(`siteverify ${response.status}`);
		const result = v.safeParse(turnstileSuccessSchema, await response.json());
		const expectedHostname = new URL(ORIGIN!).hostname;
		return result.success && result.output.hostname === expectedHostname;
	} catch {
		return false;
	}
}
