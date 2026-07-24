import type { AuthAPIErrorResponse, AuthAPIResponse, AuthModalView } from '$lib/types/auth';

export class AuthAPIError extends Error {
	readonly modal: AuthModalView | null;
	readonly reauthenticationRequired: boolean;

	constructor(
		message: string,
		options: { modal?: AuthModalView; reauthenticationRequired?: boolean }
	) {
		super(message);
		this.name = 'AuthAPIError';
		this.modal = options.modal ?? null;
		this.reauthenticationRequired = options.reauthenticationRequired ?? false;
	}
}

export async function authRequest(
	endpoint: string,
	init: RequestInit = {}
): Promise<AuthAPIResponse> {
	const response = await fetch(endpoint, init);
	const data = await readResponse(response);
	if (!response.ok) {
		const error = isErrorResponse(data) ? data : null;
		throw new AuthAPIError(
			error?.message || response.statusText || 'Authentication request failed',
			{
				modal: error?.modal,
				reauthenticationRequired: error?.reauthenticationRequired
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
