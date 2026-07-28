import { building } from '$app/env';
import { defineEnvVars } from '@sveltejs/kit/env';
import { decodeBase64 } from '@oslojs/encoding';
import * as v from 'valibot';

const nonEmptyString = v.pipe(v.string(), v.nonEmpty());
const requiredAtRuntime = building ? v.optional(nonEmptyString) : nonEmptyString;
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

export const variables = defineEnvVars({
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
	AUTH_ENCRYPTION_KEY: {
		schema: building ? v.optional(encryptionKey) : encryptionKey
	},
	WEBAUTHN_RP_ID: { schema: requiredAtRuntime },
	WEBAUTHN_RP_NAME: { schema: requiredAtRuntime },
	WEBAUTHN_ORIGIN: {
		schema: building ? v.optional(v.pipe(nonEmptyString, v.url())) : v.pipe(nonEmptyString, v.url())
	},
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
