import { CONTACT_EMAIL } from '$app/env/private';
import { hasTurnstileConfiguration } from '$lib/server/turnstile';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({
	contactEmail: CONTACT_EMAIL ?? null,
	turnstileEnabled: hasTurnstileConfiguration()
});
