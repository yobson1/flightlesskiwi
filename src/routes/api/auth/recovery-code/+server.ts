import { json } from '@sveltejs/kit';
import { hashRecoveryCode } from '$lib/server/auth/password';
import {
	deletePendingRecoveryCodeCookie,
	getPendingRecoveryCode,
	setPendingRecoveryCodeCookie
} from '$lib/server/auth/recovery-code';
import { generateRandomRecoveryCode } from '$lib/server/auth/utils';
import { setUserRecoveryCodeHash } from '$lib/server/auth/user';
import type { RequestEvent } from './$types';

export function POST(event: RequestEvent) {
	event.setHeaders({ 'cache-control': 'no-store' });
	if (event.locals.session === null || event.locals.user === null) {
		return new Response('Not authenticated', { status: 401 });
	}
	if (
		!event.locals.authenticated ||
		!event.locals.user.registeredTOTP ||
		event.locals.user.recoveryCodeConfigured
	) {
		return new Response('Forbidden', { status: 403 });
	}
	let recoveryCode = getPendingRecoveryCode(event, event.locals.user.id);
	if (recoveryCode === null) {
		recoveryCode = generateRandomRecoveryCode();
		setPendingRecoveryCodeCookie(event, event.locals.user.id, recoveryCode);
	}
	return json({ recoveryCode });
}

export async function PUT(event: RequestEvent) {
	event.setHeaders({ 'cache-control': 'no-store' });
	if (event.locals.session === null || event.locals.user === null) {
		return new Response('Not authenticated', { status: 401 });
	}
	if (
		!event.locals.authenticated ||
		!event.locals.user.registeredTOTP ||
		event.locals.user.recoveryCodeConfigured
	) {
		return new Response('Forbidden', { status: 403 });
	}
	const recoveryCode = getPendingRecoveryCode(event, event.locals.user.id);
	if (recoveryCode === null) {
		return new Response('Recovery code setup expired', { status: 400 });
	}
	const recoveryCodeHash = await hashRecoveryCode(recoveryCode);
	setUserRecoveryCodeHash(event.locals.user.id, recoveryCodeHash);
	deletePendingRecoveryCodeCookie(event);
	return new Response(null, { status: 204 });
}
