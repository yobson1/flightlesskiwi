// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	interface Window {
		turnstile?: {
			render(
				container: HTMLElement,
				options: {
					sitekey: string;
					action: string;
					theme: 'auto' | 'light' | 'dark';
					callback(token: string): void;
					'expired-callback'(): void;
					'error-callback'(): void;
				}
			): string;
			remove(widgetId: string): void;
			reset(widgetId: string): void;
		};
	}

	namespace App {
		interface Locals {
			user: import('$lib/server/auth').SessionValidationResult['user'];
			session: import('$lib/server/auth').SessionValidationResult['session'];
		}
	} // interface Error {}
	// interface Locals {}
} // interface PageData {}
// interface PageState {}

// interface Platform {}
export {};
