const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function isCrossOriginAPIRequest(
	request: Request,
	pathname: string,
	expectedOrigin: string
): boolean {
	if (!isAPIPath(pathname) || SAFE_METHODS.has(request.method.toUpperCase())) return false;

	const source = request.headers.get('origin') ?? request.headers.get('referer');
	if (source === null) return true;

	try {
		return new URL(source).origin !== expectedOrigin;
	} catch {
		return true;
	}
}

function isAPIPath(pathname: string): boolean {
	return pathname === '/api' || pathname.startsWith('/api/');
}
