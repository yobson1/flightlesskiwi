export const TURNSTILE_ACTION = 'turnstile-spin-v2';
export const TURNSTILE_RESPONSE_FIELD = 'cf-turnstile-response';

const UNPROTECTED_AUTH_POST_ENDPOINTS = new Set([
	'/api/auth/passkey-registration',
	'/api/auth/recovery-code',
	'/api/auth/totp-setup'
]);

export function isTurnstileProtectedAuthRequest(pathname: string, method: string): boolean {
	const normalizedMethod = method.toUpperCase();
	if (!pathname.startsWith('/api/auth/')) return false;
	if (pathname === '/api/auth/logout') return false;
	if (normalizedMethod === 'GET' || normalizedMethod === 'HEAD' || normalizedMethod === 'OPTIONS') {
		return false;
	}
	if (normalizedMethod === 'POST' && UNPROTECTED_AUTH_POST_ENDPOINTS.has(pathname)) {
		return false;
	}
	return true;
}
