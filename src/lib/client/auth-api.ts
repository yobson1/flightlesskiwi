import {
	authAPIErrorResponseSchema,
	authAPIResponseSchema,
	type AuthAPIResponse,
	type AuthModalView
} from '$lib/types/auth';
import { resetAuthTurnstile, takeAuthTurnstileToken } from '$lib/client/auth-turnstile';
import { requiresAuthTurnstile, TURNSTILE_RESPONSE_FIELD } from '$lib/turnstile';
import * as v from 'valibot';

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
	const protectedByTurnstile = requiresAuthTurnstile(pathname, method);
	const token = protectedByTurnstile ? await takeAuthTurnstileToken(init.signal) : null;
	const headers = new Headers(init.headers);
	if (token) headers.set(TURNSTILE_RESPONSE_FIELD, token);

	let response: Response;
	try {
		response = await fetch(endpoint, { ...init, headers });
	} finally {
		if (token) resetAuthTurnstile();
	}
	if (!response.ok) {
		const error = await readResponse(response, authAPIErrorResponseSchema);
		throw new AuthAPIError(
			error?.message || response.statusText || 'Authentication request failed',
			{
				modal: error?.modal,
				reauthenticationRequired: error?.reauthenticationRequired,
				retryAfterSeconds: error?.retryAfterSeconds
			}
		);
	}
	const result = await readResponse(response, authAPIResponseSchema);
	if (result === null) {
		throw new AuthAPIError('Invalid authentication response', {});
	}
	return result;
}

export async function authFormRequest(
	endpoint: string,
	formData: FormData,
	init: Omit<RequestInit, 'body' | 'method'> = {}
): Promise<AuthAPIResponse> {
	return authRequest(endpoint, { ...init, method: 'POST', body: formData });
}

async function readResponse<
	const Schema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>
>(response: Response, schema: Schema): Promise<v.InferOutput<Schema> | null> {
	let data: unknown;
	const contentType = response.headers.get('content-type');
	if (contentType?.includes('application/json')) {
		try {
			data = await response.json();
		} catch {
			return null;
		}
	} else {
		const message = await response.text();
		data = message ? { message } : null;
	}
	const result = v.safeParse(schema, data);
	return result.success ? result.output : null;
}

export function computeResendAvailableAt(
	value: { retryAfterSeconds?: number },
	defaultIntervalSeconds: number
): number {
	const result = v.safeParse(
		v.pipe(v.number(), v.finite(), v.minValue(0), v.transform(Math.ceil)),
		value.retryAfterSeconds
	);
	const retryAfterSeconds = result.success ? result.output : defaultIntervalSeconds;
	return Date.now() + retryAfterSeconds * 1000;
}
