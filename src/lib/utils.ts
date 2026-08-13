import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function getMessage(value: unknown, fallback: string): string {
	if (
		typeof value === 'object' &&
		value !== null &&
		'message' in value &&
		typeof value.message === 'string'
	) {
		return value.message;
	}
	return fallback;
}

export function getActionMessage(value: unknown, fallback: string): string {
	if (typeof value !== 'object' || value === null) return fallback;
	if ('message' in value && typeof value.message === 'string') return value.message;
	for (const nested of Object.values(value)) {
		if (typeof nested === 'object' && nested !== null && 'message' in nested) {
			const message = nested.message;
			if (typeof message === 'string') return message;
		}
	}
	return fallback;
}

export function isNonArrayObject(value: unknown): value is object {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, 'child'> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, 'children'> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };
