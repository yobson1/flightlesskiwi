import { building } from '$app/environment';
import { env } from '$env/dynamic/private';

export function getRequiredEnvironmentVariable(name: string, buildFallback: string): string {
	const value = env[name];
	if (value) return value;
	if (building) return buildFallback;
	throw new Error(`${name} is not set`);
}
