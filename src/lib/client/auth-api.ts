import type { AuthAPIErrorResponse, AuthAPIResponse, AuthModalView } from '$lib/types/auth';
import { resetAuthTurnstile, takeAuthTurnstileToken } from '$lib/client/auth-turnstile';
import { isTurnstileProtectedAuthRequest, TURNSTILE_RESPONSE_FIELD } from '$lib/turnstile';

export class AuthAPIError extends Error {
	readonly modal: AuthModalView | null;
	readonly reauthenticationRequired: boolean;
	readonly retryAfterSeconds: number;

	constructor(
		message: string,
		options: {
			modal?: AuthModalView;
			reauthenticationRequired?: boolean;
			retryAfterSeconds?: number;
		}
	) {
		super(message);
		this.name = 'AuthAPIError';
		this.modal = options.modal ?? null;
		this.reauthenticationRequired = options.reauthenticationRequired ?? false;
		this.retryAfterSeconds = options.retryAfterSeconds ?? 0;
	}
}

export async function authRequest(
	endpoint: string,
	init: RequestInit = {}
): Promise<AuthAPIResponse> {
	const method = init.method ?? 'GET';
	const pathname = new URL(endpoint, window.location.origin).pathname;
	const protectedByTurnstile = isTurnstileProtectedAuthRequest(pathname, method);
	const token = protectedByTurnstile ? await takeAuthTurnstileToken(init.signal) : null;
	const headers = new Headers(init.headers);
	if (token) headers.set(TURNSTILE_RESPONSE_FIELD, token);

	let response: Response;
	try {
		response = await fetch(endpoint, { ...init, headers });
	} finally {
		if (token) resetAuthTurnstile();
	}
	const data = await readResponse(response);
	if (!response.ok) {
		const error = isErrorResponse(data) ? data : null;
		throw new AuthAPIError(
			error?.message || response.statusText || 'Authentication request failed',
			{
				modal: error?.modal,
				reauthenticationRequired: error?.reauthenticationRequired,
				retryAfterSeconds: error?.retryAfterSeconds
			}
		);
	}
	if (!isSuccessResponse(data)) {
		throw new AuthAPIError('Invalid authentication response', {});
	}
	return data;
}

export async function authFormRequest(
	endpoint: string,
	formData: FormData,
	init: Omit<RequestInit, 'body' | 'method'> = {}
): Promise<AuthAPIResponse> {
	return authRequest(endpoint, { ...init, method: 'POST', body: formData });
}

async function readResponse(response: Response): Promise<unknown> {
	const contentType = response.headers.get('content-type');
	if (contentType?.includes('application/json')) {
		try {
			return await response.json();
		} catch {
			return null;
		}
	}
	const message = await response.text();
	return message ? { message } : null;
}

function isSuccessResponse(value: unknown): value is AuthAPIResponse {
	return (
		typeof value === 'object' &&
		value !== null &&
		'next' in value &&
		(value.next === null || typeof value.next === 'string')
	);
}

function isErrorResponse(value: unknown): value is AuthAPIErrorResponse {
	return (
		typeof value === 'object' &&
		value !== null &&
		'message' in value &&
		typeof value.message === 'string'
	);
}

export function computeResendAvailableAt(value: unknown, defaultIntervalSeconds: number): number {
	const retryAfterSeconds =
		typeof value === 'object' &&
		value !== null &&
		'retryAfterSeconds' in value &&
		typeof value.retryAfterSeconds === 'number' &&
		Number.isFinite(value.retryAfterSeconds) &&
		value.retryAfterSeconds >= 0
			? Math.ceil(value.retryAfterSeconds)
			: defaultIntervalSeconds;
	return Date.now() + retryAfterSeconds * 1000;
}
