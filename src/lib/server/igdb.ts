import apicalypse from 'apicalypse';
import type { ApicalypseConfig } from 'apicalypse';
import { version } from '$app/env';
import { IGDB_CLIENT_ID, IGDB_CLIENT_SECRET } from '$app/env/private';
import { info } from '#lib/logger.js';
import * as v from 'valibot';

const REQUEST_TIMEOUT_MS = 15_000;
const accessTokenResponseSchema = v.object({
	access_token: v.string(),
	expires_in: v.number()
});
interface AccessTokenCache {
	token: string | null;
	expiry: number;
}

const tokenCache: AccessTokenCache = {
	token: null,
	expiry: 0
};
let tokenRefresh: Promise<string> | undefined;

export function invalidateIgdbAccessToken() {
	tokenCache.token = null;
	tokenCache.expiry = 0;
}

async function refreshAccessToken() {
	info('Refreshing IGDB access token');
	const response = await fetch('https://id.twitch.tv/oauth2/token', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: new URLSearchParams({
			client_id: IGDB_CLIENT_ID!,
			client_secret: IGDB_CLIENT_SECRET!,
			grant_type: 'client_credentials'
		}),
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
	});

	if (!response.ok) {
		throw new Error(`Failed to get IGDB access token (${response.status} ${response.statusText})`);
	}

	const result = v.safeParse(accessTokenResponseSchema, await response.json());
	if (!result.success) {
		throw new Error('IGDB returned an invalid access token response');
	}
	const data = result.output;

	tokenCache.token = data.access_token;
	tokenCache.expiry = Date.now() + data.expires_in * 1000 - 60_000;
	info(`IGDB access token refreshed; expires in ${Math.floor(data.expires_in / 86_400)} days`);

	return data.access_token;
}

async function getAccessToken() {
	if (tokenCache.token && tokenCache.expiry > Date.now()) return tokenCache.token;

	tokenRefresh ??= refreshAccessToken().finally(() => {
		tokenRefresh = undefined;
	});

	return tokenRefresh;
}

export async function igdb(query?: string) {
	const token = await getAccessToken();
	const igdbOptions: ApicalypseConfig = {
		method: 'POST',
		queryMethod: 'body',
		baseURL: 'https://api.igdb.com/v4',
		headers: {
			'Client-ID': IGDB_CLIENT_ID!,
			Authorization: `Bearer ${token}`,
			'X-User-Agent': `flightlesskiwi v${version}`,
			Accept: 'application/json'
		},
		responseType: 'json',
		timeout: REQUEST_TIMEOUT_MS
	};

	return query ? apicalypse(query, igdbOptions) : apicalypse(igdbOptions);
}
