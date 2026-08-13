import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import * as v from 'valibot';

const messageSchema = v.object({ message: v.string() });
const actionMessagesSchema = v.pipe(
	v.record(v.string(), v.fallback(v.nullable(messageSchema), null)),
	v.check((messages) => !Array.isArray(messages))
);

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function getMessage(value: unknown, fallback: string): string {
	const result = v.safeParse(messageSchema, value);
	return result.success ? result.output.message : fallback;
}

export function getActionMessage(value: unknown, fallback: string): string {
	const direct = v.safeParse(messageSchema, value);
	if (direct.success) return direct.output.message;
	const nested = v.safeParse(actionMessagesSchema, value);
	return nested.success
		? (Object.values(nested.output).find((entry) => entry !== null)?.message ?? fallback)
		: fallback;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, 'child'> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, 'children'> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };
