export const OAUTH_PROVIDERS = ['github', 'discord', 'twitch'] as const;
export const OAUTH_ERROR_CODES = [
	'cancelled',
	'expired',
	'unavailable',
	'rejected',
	'unverified-email',
	'session',
	'factor',
	'identity',
	'provider',
	'failed'
] as const;

export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];
export type OAuthErrorCode = (typeof OAUTH_ERROR_CODES)[number];

const OAUTH_PROVIDER_NAMES: Record<OAuthProvider, string> = {
	github: 'GitHub',
	discord: 'Discord',
	twitch: 'Twitch'
};

export function isOAuthProvider(value: string): value is OAuthProvider {
	return (OAUTH_PROVIDERS as readonly string[]).includes(value);
}

export function isOAuthErrorCode(value: string): value is OAuthErrorCode {
	return (OAUTH_ERROR_CODES as readonly string[]).includes(value);
}

export function getOAuthProviderName(provider: OAuthProvider): string {
	return OAUTH_PROVIDER_NAMES[provider];
}

export function canRemoveOAuthConnection(
	hasPassword: boolean,
	hasPasskey: boolean,
	connectionCount: number
): boolean {
	return hasPassword || hasPasskey || connectionCount > 1;
}

export function getOAuthErrorMessage(code: OAuthErrorCode, provider: OAuthProvider | null): string {
	const providerName = provider === null ? 'OAuth provider' : getOAuthProviderName(provider);
	switch (code) {
		case 'cancelled':
			return `${providerName} sign-in was cancelled.`;
		case 'expired':
			return 'Your OAuth sign-in request expired. Please try again.';
		case 'unavailable':
			return `${providerName} is temporarily unavailable. Please try again.`;
		case 'rejected':
			return `${providerName} rejected the sign-in request. Please try again.`;
		case 'unverified-email':
			return `${providerName} did not provide a verified email address.`;
		case 'session':
			return 'Your session expired. Sign in again before continuing.';
		case 'factor':
			return 'Use your authenticator or passkey to confirm this change.';
		case 'identity':
			return `That ${providerName} account is not linked to your account.`;
		case 'provider':
			return 'That OAuth provider is not supported.';
		case 'failed':
			return `${providerName} authentication could not be completed. Please try again.`;
	}
}
