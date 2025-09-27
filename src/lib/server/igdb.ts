import { IGDB_CLIENT_ID, IGDB_CLIENT_SECRET } from '$env/static/private';
import apicalypse from 'apicalypse';
import type { ApicalypseConfig } from 'apicalypse';
import { version } from '$app/environment';
import { info } from '$lib/logger';

if (!IGDB_CLIENT_ID || !IGDB_CLIENT_SECRET) {
	throw new Error('IGDB_CLIENT_ID or IGDB_CLIENT_SECRET is not set');
}

/* eslint-disable prefer-const */
let tokenCache: { token: string | null; expiry: number | null } = {
	token: null,
	expiry: null
};

async function getAccessToken(): Promise<string> {
	if (!tokenCache.token || (tokenCache.expiry ?? 0) < Date.now()) {
		info('Refreshing IGDB access token');
		const response = await fetch('https://id.twitch.tv/oauth2/token', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded'
			},
			body: new URLSearchParams({
				client_id: IGDB_CLIENT_ID,
				client_secret: IGDB_CLIENT_SECRET,
				grant_type: 'client_credentials'
			})
		});

		if (!response.ok) {
			throw new Error(`Failed to get access token: ${response.statusText}`);
		}

		const data = await response.json();
		tokenCache.token = data.access_token;
		tokenCache.expiry = Date.now() + data.expires_in * 1000 - 60000; // 1 min buffer
		info(
			`Token (${tokenCache.token}) expires in ${Math.floor(data.expires_in / 60 / 60 / 24)} days`
		);
	}

	return tokenCache.token!;
}

export async function igdb() {
	const token = await getAccessToken();
	const igdbOptions: ApicalypseConfig = {
		method: 'POST',
		queryMethod: 'body',
		baseURL: 'https://api.igdb.com/v4',
		headers: {
			'Client-ID': IGDB_CLIENT_ID,
			Authorization: `Bearer ${token}`,
			'X-User-Agent': `flightlesskiwi v${version}`,
			Accept: 'application/json'
		},
		responseType: 'json'
	};

	return apicalypse(igdbOptions);
}
