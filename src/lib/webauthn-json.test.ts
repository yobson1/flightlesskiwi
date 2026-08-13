import { describe, expect, test } from 'bun:test';
import {
	parseAuthenticationOptions,
	parseAuthenticationResponse,
	parseRegistrationOptions,
	parseRegistrationResponse
} from '$lib/webauthn-json';

describe('WebAuthn JSON parsing', () => {
	test('parses authentication options without an optional RP ID', () => {
		const options = {
			challenge: 'challenge',
			userVerification: 'required'
		} as const;

		expect(parseAuthenticationOptions(options)).toEqual(options);
	});

	test('rejects malformed authentication options', () => {
		expect(parseAuthenticationOptions({ challenge: 123 })).toBeNull();
		expect(
			parseAuthenticationOptions({
				challenge: 'challenge',
				allowCredentials: [{ id: 'credential', type: 'not-public-key' }]
			})
		).toBeNull();
	});

	test('parses registration options', () => {
		const options = {
			rp: { id: 'example.com', name: 'Example' },
			user: { id: 'user', name: 'user@example.com', displayName: 'User' },
			challenge: 'challenge',
			pubKeyCredParams: [{ alg: -7, type: 'public-key' }]
		} as const;

		expect(parseRegistrationOptions(options)).not.toBeNull();
	});

	test('rejects malformed registration options', () => {
		expect(
			parseRegistrationOptions({
				rp: { name: 'Example' },
				user: { id: 'user', name: 'user@example.com' },
				challenge: 'challenge',
				pubKeyCredParams: []
			})
		).toBeNull();
	});

	test('parses authentication and registration responses', () => {
		expect(
			parseAuthenticationResponse({
				id: 'credential',
				rawId: 'credential',
				type: 'public-key',
				clientExtensionResults: {},
				response: {
					clientDataJSON: 'client-data',
					authenticatorData: 'authenticator-data',
					signature: 'signature'
				}
			})
		).not.toBeNull();
		expect(
			parseRegistrationResponse({
				id: 'credential',
				rawId: 'credential',
				type: 'public-key',
				clientExtensionResults: {},
				response: {
					clientDataJSON: 'client-data',
					attestationObject: 'attestation-object'
				}
			})
		).not.toBeNull();
	});

	test('rejects responses with malformed nested values', () => {
		expect(
			parseAuthenticationResponse({
				id: 'credential',
				rawId: 'credential',
				type: 'public-key',
				clientExtensionResults: {},
				response: {
					clientDataJSON: 'client-data',
					authenticatorData: 'authenticator-data',
					signature: 123
				}
			})
		).toBeNull();
	});
});
