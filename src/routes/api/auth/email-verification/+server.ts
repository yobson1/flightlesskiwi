import { json } from '@sveltejs/kit';
import { error as logError } from '$lib/logger';
import { sendVerificationEmail } from '$lib/server/auth/email';
import {
	createEmailVerificationRequest,
	getUserEmailVerificationRequestFromRequest,
	sendVerificationEmailBucket,
	setEmailVerificationRequestCookie
} from '$lib/server/auth/email-verification';
import type { RequestEvent } from './$types';

export async function POST(event: RequestEvent) {
	if (event.locals.session === null || event.locals.user === null) {
		return new Response('Not authenticated', { status: 401 });
	}
	if (event.locals.user.emailVerified) {
		return new Response('Email is already verified', { status: 409 });
	}

	const current = getUserEmailVerificationRequestFromRequest(event);
	if (current !== null && current.expiresAt > new Date()) {
		return json({ sent: false });
	}
	if (!sendVerificationEmailBucket.consume(event.locals.user.id, 1)) {
		return new Response('Too many verification emails requested', { status: 429 });
	}

	const request = createEmailVerificationRequest(event.locals.user.id, event.locals.user.email);
	setEmailVerificationRequestCookie(event, request);
	try {
		await sendVerificationEmail(request.email, request.code);
	} catch (cause) {
		logError('Failed to restore email verification request', cause);
		return new Response('The verification email could not be sent', { status: 503 });
	}
	return json({ sent: true });
}
