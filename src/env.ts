import { building } from '$app/env';
import { defineEnvVars } from '@sveltejs/kit/env';
import * as v from 'valibot';
import { decodeBase64 } from '#lib/encoding.js';

const nonEmptyString = v.pipe(v.string(), v.nonEmpty());
const requiredAtRuntime = building ? v.optional(nonEmptyString) : nonEmptyString;
const url = v.pipe(nonEmptyString, v.url());
const requiredUrlAtRuntime = building ? v.optional(url) : url;
const httpHeaderName = v.pipe(
	nonEmptyString,
	v.regex(/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/, 'Must be a valid HTTP header name')
);
const encryptionKey = v.pipe(
	nonEmptyString,
	v.check((value) => {
		try {
			return decodeBase64(value).byteLength === 32;
		} catch {
			return false;
		}
	}, 'Must be a base64-encoded 32-byte key')
);
const timeZone = v.pipe(
	nonEmptyString,
	v.check((value) => {
		try {
			new Intl.DateTimeFormat('en', { timeZone: value }).format();
			return true;
		} catch {
			return false;
		}
	}, 'Must be a valid IANA time-zone name')
);

export const variables = defineEnvVars({
	ORIGIN: {
		schema: requiredUrlAtRuntime,
		description: 'Public origin used by SvelteKit and security checks'
	},
	DATABASE_URL: { schema: requiredAtRuntime },
	BENCHMARK_UPLOAD_DIR: {
		schema: v.optional(nonEmptyString, 'uploads/benchmarks')
	},
	MEILI_MASTER_KEY: { schema: requiredAtRuntime },
	MEILI_HOST: {
		schema: v.optional(v.pipe(nonEmptyString, v.url()), 'http://localhost:7700')
	},
	IGDB_CLIENT_ID: { schema: requiredAtRuntime },
	IGDB_CLIENT_SECRET: { schema: requiredAtRuntime },
	IGDB_IMPORT_CRON: {
		schema: v.optional(nonEmptyString, '0 0 * * *'),
		description: 'Cron schedule for importing updated games from IGDB'
	},
	IGDB_IMPORT_TIME_ZONE: {
		schema: v.optional(timeZone),
		description: 'IANA time zone for IGDB imports; defaults to the system time zone'
	},
	AUTH_ENCRYPTION_KEY: {
		schema: building ? v.optional(encryptionKey) : encryptionKey
	},
	CLIENT_IP_HEADER: {
		schema: v.optional(httpHeaderName),
		description: 'Header set by the trusted reverse proxy containing the original client IP'
	},
	TRUSTED_PROXY_ADDRESS: {
		schema: v.optional(nonEmptyString),
		description: 'Direct client address from which CLIENT_IP_HEADER may be trusted'
	},
	TURNSTILE_SITE_KEY: {
		schema: v.optional(nonEmptyString),
		description: 'Cloudflare Turnstile site key; Turnstile is disabled when either key is unset'
	},
	TURNSTILE_SECRET: {
		schema: v.optional(nonEmptyString),
		description: 'Cloudflare Turnstile secret; Turnstile is disabled when either key is unset'
	},
	CONTACT_EMAIL: {
		schema: v.optional(v.pipe(nonEmptyString, v.email())),
		description: 'Public contact address shown on the privacy page'
	},
	WEBAUTHN_RP_ID: { schema: requiredAtRuntime },
	WEBAUTHN_RP_NAME: { schema: requiredAtRuntime },
	WEBAUTHN_ORIGIN: {
		schema: requiredUrlAtRuntime
	},
	GITHUB_OAUTH_CLIENT_ID: { schema: v.optional(nonEmptyString) },
	GITHUB_OAUTH_CLIENT_SECRET: { schema: v.optional(nonEmptyString) },
	DISCORD_OAUTH_CLIENT_ID: { schema: v.optional(nonEmptyString) },
	DISCORD_OAUTH_CLIENT_SECRET: { schema: v.optional(nonEmptyString) },
	TWITCH_OAUTH_CLIENT_ID: { schema: v.optional(nonEmptyString) },
	TWITCH_OAUTH_CLIENT_SECRET: { schema: v.optional(nonEmptyString) },
	SMTP_HOST: { schema: requiredAtRuntime },
	SMTP_PORT: {
		schema: v.optional(
			v.pipe(
				nonEmptyString,
				v.regex(/^\d+$/),
				v.check((value) => Number(value) >= 1 && Number(value) <= 65_535)
			),
			'587'
		)
	},
	SMTP_SECURE: {
		schema: v.optional(v.picklist(['true', 'false']), 'false')
	},
	SMTP_USER: { schema: v.optional(v.string(), '') },
	SMTP_PASSWORD: { schema: v.optional(v.string(), '') },
	SMTP_FROM: { schema: requiredAtRuntime }
});
