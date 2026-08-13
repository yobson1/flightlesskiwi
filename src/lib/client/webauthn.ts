import {
	browserSupportsWebAuthnAutofill,
	startAuthentication,
	startRegistration,
	WebAuthnAbortService,
	type AuthenticationResponseJSON,
	type PublicKeyCredentialCreationOptionsJSON,
	type PublicKeyCredentialRequestOptionsJSON,
	type RegistrationResponseJSON
} from '@simplewebauthn/browser';
import { decodeBase64url } from '$lib/encoding';
import {
	fetchPasskeyAuthenticatorMetadata,
	formatAAGUID
} from '$lib/passkey-authenticator-metadata';
import type { WebAuthnChallengePurpose } from '$lib/types/webauthn';
import { parseAuthenticationOptions } from '$lib/webauthn-json';
import * as v from 'valibot';

const webAuthnCancellationSchema = v.pipe(
	v.instance(Error),
	v.check((error) => error.name === 'NotAllowedError')
);

async function getWebAuthnOptions(
	purpose: Exclude<WebAuthnChallengePurpose, 'passkey-register'>,
	signal?: AbortSignal
): Promise<PublicKeyCredentialRequestOptionsJSON> {
	const response = await fetch('/api/webauthn/options', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ purpose }),
		signal
	});
	if (!response.ok) {
		throw new Error('Failed to create WebAuthn options');
	}
	const data: unknown = await response.json();
	const options = parseAuthenticationOptions(data);
	if (options === null) {
		throw new Error('Invalid WebAuthn authentication options');
	}
	return options;
}

export async function createWebAuthnAssertion(
	purpose: Exclude<WebAuthnChallengePurpose, 'passkey-register'>,
	options: WebAuthnAssertionOptions = {}
): Promise<WebAuthnAssertion> {
	verifyWebAuthnSupport();
	if (options.useBrowserAutofill && !(await browserSupportsWebAuthnAutofill())) {
		throw new Error('Browser does not support WebAuthn autofill');
	}
	const authenticationOptions = await getWebAuthnOptions(purpose, options.signal);

	return startAuthentication({
		optionsJSON: authenticationOptions,
		useBrowserAutofill: options.useBrowserAutofill
	});
}

export function cancelWebAuthnCeremony(): void {
	WebAuthnAbortService.cancelCeremony();
}

export async function createWebAuthnRegistration(
	options: PublicKeyCredentialCreationOptionsJSON
): Promise<WebAuthnRegistration> {
	verifyWebAuthnSupport();

	const credential = await startRegistration({
		optionsJSON: options
	});

	let suggestedName = '';
	try {
		const authenticatorData = decodeBase64url(credential.response.authenticatorData ?? '');
		if (authenticatorData.byteLength >= 53 && (authenticatorData[32]! & 0x40) !== 0) {
			const aaguid = formatAAGUID(authenticatorData.slice(37, 53));
			suggestedName = (await fetchPasskeyAuthenticatorMetadata())[aaguid]?.name ?? '';
		}
	} catch {
		// Metadata is optional; a passkey can still be named manually.
	}

	return {
		credential,
		suggested_name: suggestedName
	};
}

export function parseWebAuthnCancellation(cause: unknown): Error | null {
	const result = v.safeParse(webAuthnCancellationSchema, cause);
	return result.success ? result.output : null;
}

function verifyWebAuthnSupport(): void {
	if (
		typeof window === 'undefined' ||
		!window.isSecureContext ||
		!('PublicKeyCredential' in window) ||
		!navigator.credentials
	) {
		throw new Error('Passkeys are not supported by this browser or connection');
	}
}

export type WebAuthnAssertion = AuthenticationResponseJSON;

export interface WebAuthnAssertionOptions {
	useBrowserAutofill?: boolean;
	signal?: AbortSignal;
}

export interface WebAuthnRegistration {
	credential: RegistrationResponseJSON;
	suggested_name: string;
}
