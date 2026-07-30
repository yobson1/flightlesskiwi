let enabled = false;
let token = '';
let resetWidget: (() => void) | null = null;
let waiters: Array<{
	resolve: (token: string) => void;
	reject: (cause: Error) => void;
	signal?: AbortSignal;
	abort?: () => void;
}> = [];

export function configureAuthTurnstile(value: boolean): void {
	enabled = value;
	if (enabled) return;
	token = '';
	for (const waiter of waiters) {
		cleanupWaiter(waiter);
		waiter.resolve('');
	}
	waiters = [];
}

export function setAuthTurnstileReset(callback: (() => void) | null): void {
	resetWidget = callback;
}

export function setAuthTurnstileToken(value: string): void {
	if (!enabled || !value) return;
	const waiter = waiters.shift();
	if (waiter) {
		cleanupWaiter(waiter);
		waiter.resolve(value);
		return;
	}
	token = value;
}

export function failAuthTurnstile(message = 'Unable to complete the verification challenge'): void {
	const cause = new Error(message);
	for (const waiter of waiters) {
		cleanupWaiter(waiter);
		waiter.reject(cause);
	}
	waiters = [];
}

export function takeAuthTurnstileToken(signal?: AbortSignal | null): Promise<string | null> {
	if (!enabled) return Promise.resolve(null);
	if (signal?.aborted) return Promise.reject(abortError(signal));
	if (token) {
		const value = token;
		token = '';
		return Promise.resolve(value);
	}
	return new Promise((resolve, reject) => {
		const waiter: (typeof waiters)[number] = { resolve, reject, signal: signal ?? undefined };
		if (signal) {
			waiter.abort = () => {
				const index = waiters.indexOf(waiter);
				if (index !== -1) waiters.splice(index, 1);
				reject(abortError(signal));
			};
			signal.addEventListener('abort', waiter.abort, { once: true });
		}
		waiters.push(waiter);
	});
}

export function resetAuthTurnstile(): void {
	token = '';
	resetWidget?.();
}

function cleanupWaiter(waiter: (typeof waiters)[number]): void {
	if (waiter.signal && waiter.abort) waiter.signal.removeEventListener('abort', waiter.abort);
}

function abortError(signal: AbortSignal): Error {
	return signal.reason instanceof Error
		? signal.reason
		: new DOMException('The operation was aborted', 'AbortError');
}
