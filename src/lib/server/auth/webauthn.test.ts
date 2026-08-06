import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { encodeBase64url } from '$lib/encoding';
import * as schema from '$lib/server/db/schema';
import { createTestDatabase } from '$lib/server/test-db';
import { TEST_PRIVATE_ENV } from '$lib/server/test-env';

interface AuthenticationVerificationOptions {
	expectedChallenge: (challenge: string) => boolean | Promise<boolean>;
	expectedOrigin: string;
	expectedRPID: string;
	credential: {
		id: string;
		publicKey: Uint8Array;
		counter: number;
	};
	requireUserVerification: boolean;
}

interface RegistrationVerificationOptions {
	expectedChallenge: (challenge: string) => boolean | Promise<boolean>;
	expectedOrigin: string;
	expectedRPID: string;
	requireUserPresence: boolean;
	requireUserVerification: boolean;
	supportedAlgorithmIDs: number[];
}

const testDatabase = await createTestDatabase();
const testDb = testDatabase.db;

let authenticationOptions: AuthenticationVerificationOptions | null;
let registrationOptions: RegistrationVerificationOptions | null;
let crossOrigin: boolean;
let attestationFormat: string;

const verifyAuthenticationResponse = mock(async (value: unknown) => {
	const options = value as AuthenticationVerificationOptions;
	authenticationOptions = options;
	if (!(await options.expectedChallenge('assertion-challenge'))) {
		throw new Error('Invalid challenge');
	}
	return {
		verified: true,
		authenticationInfo: { newCounter: 8 }
	};
});

const verifyRegistrationResponse = mock(async (value: unknown) => {
	const options = value as RegistrationVerificationOptions;
	registrationOptions = options;
	if (!(await options.expectedChallenge('registration-challenge'))) {
		throw new Error('Invalid challenge');
	}
	return {
		verified: true,
		registrationInfo: {
			credential: {
				id: 'BAUG',
				publicKey: Uint8Array.from([7, 8, 9]),
				counter: 2
			},
			aaguid: '00000000-0000-0000-0000-000000000000',
			fmt: attestationFormat
		}
	};
});

const decodeClientDataJSON = mock(() => ({ crossOrigin }));

mock.module('$app/env/private', () => TEST_PRIVATE_ENV);
mock.module('$lib/server/db', () => ({ db: testDb }));
mock.module('@simplewebauthn/server', () => ({
	verifyAuthenticationResponse,
	verifyRegistrationResponse
}));
mock.module('@simplewebauthn/server/helpers', () => ({ decodeClientDataJSON }));

const {
	consumeWebAuthnChallenge,
	isWebAuthnChallengeValid,
	storeWebAuthnChallenge,
	updatePasskeyCounter,
	WEBAUTHN_SUPPORTED_ALGORITHM_IDS
} = await import('./webauthn');
const {
	verifyWebAuthnAssertionRequest,
	verifyWebAuthnRegistration,
	WebAuthnAssertionRequestError,
	WebAuthnVerificationError
} = await import('./webauthn-verify');

beforeEach(() => {
	testDb.delete(schema.webAuthnChallenge).run();
	testDb.delete(schema.passkeyCredential).run();
	testDb.delete(schema.user).run();
	insertUser('first-user');
	insertUser('second-user');
	authenticationOptions = null;
	registrationOptions = null;
	crossOrigin = false;
	attestationFormat = 'none';
	verifyAuthenticationResponse.mockClear();
	verifyRegistrationResponse.mockClear();
	decodeClientDataJSON.mockClear();
});

afterAll(() => {
	testDatabase.close();
});

describe('WebAuthn challenge storage', () => {
	test('binds a generated options challenge to its user and purpose and consumes it once', () => {
		storeWebAuthnChallenge('generated-registration-challenge', 'first-user', 'passkey-register');

		expect(
			isWebAuthnChallengeValid('generated-registration-challenge', 'first-user', 'passkey-register')
		).toBe(true);
		expect(
			isWebAuthnChallengeValid(
				'generated-registration-challenge',
				'second-user',
				'passkey-register'
			)
		).toBe(false);
		expect(
			isWebAuthnChallengeValid('generated-registration-challenge', 'first-user', 'passkey-2fa')
		).toBe(false);

		expect(
			consumeWebAuthnChallenge('generated-registration-challenge', 'first-user', 'passkey-register')
		).toBe(true);
		expect(
			consumeWebAuthnChallenge('generated-registration-challenge', 'first-user', 'passkey-register')
		).toBe(false);
	});

	test('rejects and removes an expired challenge when it is consumed', () => {
		storeWebAuthnChallenge('expired-challenge', 'first-user', 'passkey-register');
		testDb
			.update(schema.webAuthnChallenge)
			.set({ expiresAt: new Date(Date.now() - 1) })
			.run();

		expect(isWebAuthnChallengeValid('expired-challenge', 'first-user', 'passkey-register')).toBe(
			false
		);
		expect(consumeWebAuthnChallenge('expired-challenge', 'first-user', 'passkey-register')).toBe(
			false
		);
		expect(testDb.select().from(schema.webAuthnChallenge).all()).toHaveLength(0);
	});

	test('replaces an earlier challenge for the same user and purpose', () => {
		storeWebAuthnChallenge('first-challenge', 'first-user', 'passkey-register');
		storeWebAuthnChallenge('second-challenge', 'first-user', 'passkey-register');

		expect(isWebAuthnChallengeValid('first-challenge', 'first-user', 'passkey-register')).toBe(
			false
		);
		expect(isWebAuthnChallengeValid('second-challenge', 'first-user', 'passkey-register')).toBe(
			true
		);
	});

	test('keeps the generated and verified algorithm policy identical', () => {
		expect(WEBAUTHN_SUPPORTED_ALGORITHM_IDS).toEqual([-7, -257]);
	});
});

describe('WebAuthn credential counters', () => {
	test('atomically advances a counter from its previously verified value', () => {
		const credentialId = Uint8Array.from([1, 2, 3]);
		insertPasskey(credentialId, 4);

		expect(updatePasskeyCounter(credentialId, 4, 5)).toBe(true);
		expect(getPasskeyCounter(credentialId)).toBe(5);
		expect(updatePasskeyCounter(credentialId, 4, 6)).toBe(false);
		expect(getPasskeyCounter(credentialId)).toBe(5);
	});

	test('rejects a counter that does not increase', () => {
		const credentialId = Uint8Array.from([4, 5, 6]);
		insertPasskey(credentialId, 5);

		expect(updatePasskeyCounter(credentialId, 5, 5)).toBe(false);
		expect(updatePasskeyCounter(credentialId, 5, 4)).toBe(false);
		expect(getPasskeyCounter(credentialId)).toBe(5);
	});

	test('accepts authenticators that do not support counters', () => {
		const credentialId = Uint8Array.from([7, 8, 9]);
		insertPasskey(credentialId, 0);

		expect(updatePasskeyCounter(credentialId, 0, 0)).toBe(true);
		expect(getPasskeyCounter(credentialId)).toBe(0);
	});
});

describe('WebAuthn assertion verification', () => {
	test('passes the stored credential and security policy to SimpleWebAuthn', async () => {
		const credentialId = Uint8Array.from([1, 2, 3]);
		insertPasskey(credentialId, 7);
		storeWebAuthnChallenge('assertion-challenge', null, 'passkey-login');

		const credential = await verifyWebAuthnAssertionRequest(
			createAssertionRequest(),
			null,
			'passkey-login'
		);

		expect(credential).toMatchObject({
			id: credentialId,
			userId: 'first-user',
			signCount: 7
		});
		expect(authenticationOptions).toMatchObject({
			expectedOrigin: 'https://example.com',
			expectedRPID: 'example.com',
			credential: {
				id: 'AQID',
				publicKey: Uint8Array.from([10, 11, 12]),
				counter: 7
			},
			requireUserVerification: true
		});
		expect(isWebAuthnChallengeValid('assertion-challenge', null, 'passkey-login')).toBe(false);
		expect(getPasskeyCounter(credentialId)).toBe(8);
	});

	test('uses a user-scoped credential for an authenticated flow', async () => {
		const credentialId = Uint8Array.from([1, 2, 3]);
		insertPasskey(credentialId, 7);
		storeWebAuthnChallenge('assertion-challenge', 'first-user', 'settings-reauth');

		await verifyWebAuthnAssertionRequest(createAssertionRequest(), 'first-user', 'settings-reauth');

		expect(isWebAuthnChallengeValid('assertion-challenge', 'first-user', 'settings-reauth')).toBe(
			false
		);
		expect(getPasskeyCounter(credentialId)).toBe(8);
	});

	test('rejects replaying an assertion after its challenge was consumed', async () => {
		insertPasskey(Uint8Array.from([1, 2, 3]), 7);
		storeWebAuthnChallenge('assertion-challenge', null, 'passkey-login');
		await verifyWebAuthnAssertionRequest(createAssertionRequest(), null, 'passkey-login');

		await expect(
			verifyWebAuthnAssertionRequest(createAssertionRequest(), null, 'passkey-login')
		).rejects.toBeInstanceOf(WebAuthnAssertionRequestError);
	});

	test('rejects cross-origin client data before invoking SimpleWebAuthn', async () => {
		insertPasskey(Uint8Array.from([1, 2, 3]), 7);
		crossOrigin = true;

		await expect(
			verifyWebAuthnAssertionRequest(createAssertionRequest(), null, 'passkey-login')
		).rejects.toBeInstanceOf(WebAuthnAssertionRequestError);
		expect(verifyAuthenticationResponse).not.toHaveBeenCalled();
	});
});

describe('WebAuthn registration verification', () => {
	test('passes the registration policy to SimpleWebAuthn and consumes the challenge', async () => {
		storeWebAuthnChallenge('registration-challenge', 'first-user', 'passkey-register');

		const credential = await verifyWebAuthnRegistration(
			createRegistrationResponse(),
			'first-user',
			'passkey-register'
		);

		expect(registrationOptions).toMatchObject({
			expectedOrigin: 'https://example.com',
			expectedRPID: 'example.com',
			requireUserPresence: true,
			requireUserVerification: true,
			supportedAlgorithmIDs: [-7, -257]
		});
		expect(credential).toEqual({
			id: Uint8Array.from([4, 5, 6]),
			aaguid: '00000000-0000-0000-0000-000000000000',
			publicKey: Uint8Array.from([7, 8, 9]),
			signCount: 2
		});
		expect(
			isWebAuthnChallengeValid('registration-challenge', 'first-user', 'passkey-register')
		).toBe(false);
	});

	test('rejects an unexpected attestation format without consuming the challenge', async () => {
		storeWebAuthnChallenge('registration-challenge', 'first-user', 'passkey-register');
		attestationFormat = 'packed';

		await expect(
			verifyWebAuthnRegistration(createRegistrationResponse(), 'first-user', 'passkey-register')
		).rejects.toBeInstanceOf(WebAuthnVerificationError);
		expect(
			isWebAuthnChallengeValid('registration-challenge', 'first-user', 'passkey-register')
		).toBe(true);
	});
});

function insertUser(id: string): void {
	testDb
		.insert(schema.user)
		.values({
			id,
			email: `${id}@example.com`,
			username: id,
			passwordHash: 'password-hash',
			emailVerified: true,
			createdAt: new Date()
		})
		.run();
}

function insertPasskey(id: Uint8Array, signCount: number): void {
	testDb
		.insert(schema.passkeyCredential)
		.values({
			id: encodeBase64url(id),
			userId: 'first-user',
			name: 'Test passkey',
			aaguid: null,
			publicKey: Buffer.from([10, 11, 12]),
			signCount,
			createdAt: new Date()
		})
		.run();
}

function getPasskeyCounter(id: Uint8Array): number | undefined {
	return testDb
		.select({ signCount: schema.passkeyCredential.signCount })
		.from(schema.passkeyCredential)
		.where(eq(schema.passkeyCredential.id, encodeBase64url(id)))
		.get()?.signCount;
}

function createAssertionRequest(): Request {
	return new Request('https://example.com/api/auth/login/passkey', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			id: 'AQID',
			rawId: 'AQID',
			type: 'public-key',
			clientExtensionResults: {},
			response: {
				authenticatorData: 'AA',
				clientDataJSON: 'AA',
				signature: 'AA'
			}
		})
	});
}

function createRegistrationResponse(): unknown {
	return {
		id: 'BAUG',
		rawId: 'BAUG',
		type: 'public-key',
		clientExtensionResults: {},
		response: {
			attestationObject: 'AA',
			clientDataJSON: 'AA'
		}
	};
}
