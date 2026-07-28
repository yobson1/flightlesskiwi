import { WEBAUTHN_ORIGIN, WEBAUTHN_RP_ID } from '$app/env/private';
import { decodeBase64 } from '@oslojs/encoding';
import {
	ECDSAPublicKey,
	decodePKIXECDSASignature,
	decodeSEC1PublicKey,
	p256,
	verifyECDSASignature
} from '@oslojs/crypto/ecdsa';
import {
	RSAPublicKey,
	decodePKCS1RSAPublicKey,
	sha256ObjectIdentifier,
	verifyRSASSAPKCS1v15Signature
} from '@oslojs/crypto/rsa';
import {
	AttestationStatementFormat,
	ClientDataType,
	coseAlgorithmES256,
	coseAlgorithmRS256,
	coseEllipticCurveP256,
	createAssertionSignatureMessage,
	parseAttestationObject,
	parseAuthenticatorData,
	parseClientDataJSON
} from '@oslojs/webauthn';
import {
	getPasskeyCredential,
	getUserPasskeyCredential,
	updatePasskeyCounter,
	verifyWebAuthnChallenge,
	type WebAuthnUserCredential
} from '$lib/server/auth/webauthn';
import { isRecord } from '$lib/utils';
import { hashSecret } from '$lib/server/auth/utils';
import { formatAAGUID } from '$lib/passkey-authenticator-metadata';
import type { WebAuthnChallengePurpose } from '$lib/types/webauthn';

export async function verifyWebAuthnAssertionRequest(
	request: Request,
	userId: string | null,
	purpose: Exclude<WebAuthnChallengePurpose, 'passkey-register'>
): Promise<WebAuthnUserCredential> {
	const assertion = await parseAssertionRequest(request);
	if (assertion === null) {
		throw new WebAuthnAssertionRequestError('Invalid or missing fields');
	}
	const credential =
		userId === null
			? getPasskeyCredential(assertion.credentialId)
			: getUserPasskeyCredential(userId, assertion.credentialId);
	if (credential === null) {
		throw new WebAuthnAssertionRequestError('Invalid credential');
	}
	try {
		verifyWebAuthnAssertion(
			assertion.authenticatorData,
			assertion.clientDataJSON,
			assertion.signature,
			credential,
			userId,
			purpose
		);
	} catch (cause) {
		if (cause instanceof WebAuthnVerificationError) {
			throw new WebAuthnAssertionRequestError('Invalid passkey assertion');
		}
		throw cause;
	}
	return credential;
}

export function verifyWebAuthnRegistration(
	attestationObjectBytes: Uint8Array,
	clientDataJSON: Uint8Array,
	userId: string,
	purpose: Extract<WebAuthnChallengePurpose, 'passkey-register'>
): Omit<WebAuthnUserCredential, 'userId' | 'name'> {
	const attestationObject = parseAttestationObject(attestationObjectBytes);
	if (attestationObject.attestationStatement.format !== AttestationStatementFormat.None) {
		throw new WebAuthnVerificationError('Unsupported attestation format');
	}
	const authenticatorData = attestationObject.authenticatorData;
	verifyAuthenticatorData(authenticatorData);
	if (!authenticatorData.userVerified || authenticatorData.credential === null) {
		throw new WebAuthnVerificationError('User verification is required');
	}

	const clientData = parseClientDataJSON(clientDataJSON);
	if (
		clientData.type !== ClientDataType.Create ||
		clientData.origin !== WEBAUTHN_ORIGIN ||
		clientData.crossOrigin === true
	) {
		throw new WebAuthnVerificationError('Invalid client data');
	}

	const publicKey = authenticatorData.credential.publicKey;
	let encodedPublicKey: Uint8Array;
	if (publicKey.algorithm() === coseAlgorithmES256) {
		const cosePublicKey = publicKey.ec2();
		if (cosePublicKey.curve !== coseEllipticCurveP256) {
			throw new WebAuthnVerificationError('Unsupported elliptic curve');
		}
		encodedPublicKey = new ECDSAPublicKey(
			p256,
			cosePublicKey.x,
			cosePublicKey.y
		).encodeSEC1Uncompressed();
	} else if (publicKey.algorithm() === coseAlgorithmRS256) {
		const cosePublicKey = publicKey.rsa();
		encodedPublicKey = new RSAPublicKey(cosePublicKey.n, cosePublicKey.e).encodePKCS1();
	} else {
		throw new WebAuthnVerificationError('Unsupported algorithm');
	}

	if (!verifyWebAuthnChallenge(clientData.challenge, userId, purpose)) {
		throw new WebAuthnVerificationError('Invalid or expired challenge');
	}

	return {
		id: authenticatorData.credential.id,
		aaguid: formatAAGUID(authenticatorData.credential.authenticatorAAGUID),
		algorithmId: publicKey.algorithm(),
		publicKey: encodedPublicKey,
		signCount: authenticatorData.signatureCounter
	};
}

function verifyWebAuthnAssertion(
	authenticatorDataBytes: Uint8Array,
	clientDataJSON: Uint8Array,
	signatureBytes: Uint8Array,
	credential: WebAuthnUserCredential,
	challengeUserId: string | null,
	purpose: Exclude<WebAuthnChallengePurpose, 'passkey-register'>
): void {
	const authenticatorData = parseAuthenticatorData(authenticatorDataBytes);
	verifyAuthenticatorData(authenticatorData);
	if (!authenticatorData.userVerified) {
		throw new WebAuthnVerificationError('User verification is required');
	}

	const clientData = parseClientDataJSON(clientDataJSON);
	if (
		clientData.type !== ClientDataType.Get ||
		clientData.origin !== WEBAUTHN_ORIGIN ||
		clientData.crossOrigin === true
	) {
		throw new WebAuthnVerificationError('Invalid client data');
	}

	const signatureMessage = createAssertionSignatureMessage(authenticatorDataBytes, clientDataJSON);
	const signatureHash = hashSecret(signatureMessage);
	let validSignature = false;
	try {
		if (credential.algorithmId === coseAlgorithmES256) {
			validSignature = verifyECDSASignature(
				decodeSEC1PublicKey(p256, credential.publicKey),
				signatureHash,
				decodePKIXECDSASignature(signatureBytes)
			);
		} else if (credential.algorithmId === coseAlgorithmRS256) {
			validSignature = verifyRSASSAPKCS1v15Signature(
				decodePKCS1RSAPublicKey(credential.publicKey),
				sha256ObjectIdentifier,
				signatureHash,
				signatureBytes
			);
		}
	} catch {
		throw new WebAuthnVerificationError('Invalid signature encoding');
	}
	if (!validSignature) {
		throw new WebAuthnVerificationError('Invalid signature');
	}
	if (!verifyWebAuthnChallenge(clientData.challenge, challengeUserId, purpose)) {
		throw new WebAuthnVerificationError('Invalid or expired challenge');
	}
	if (
		!updatePasskeyCounter(credential.id, credential.signCount, authenticatorData.signatureCounter)
	) {
		throw new WebAuthnVerificationError('Authenticator counter did not increase');
	}
}

function verifyAuthenticatorData(
	authenticatorData: ReturnType<typeof parseAuthenticatorData>
): void {
	if (
		!authenticatorData.verifyRelyingPartyIdHash(WEBAUTHN_RP_ID!) ||
		!authenticatorData.userPresent
	) {
		throw new WebAuthnVerificationError('Invalid authenticator data');
	}
}

export class WebAuthnVerificationError extends Error {}

export class WebAuthnAssertionRequestError extends Error {}

async function parseAssertionRequest(request: Request): Promise<ParsedAssertion | null> {
	let data: unknown;
	try {
		data = await request.json();
	} catch {
		return null;
	}
	if (!isRecord(data)) return null;
	const authenticatorData = data.authenticator_data;
	const clientDataJSON = data.client_data_json;
	const credentialId = data.credential_id;
	const signature = data.signature;
	if (
		typeof authenticatorData !== 'string' ||
		typeof clientDataJSON !== 'string' ||
		typeof credentialId !== 'string' ||
		typeof signature !== 'string'
	) {
		return null;
	}
	try {
		return {
			authenticatorData: decodeBase64(authenticatorData),
			clientDataJSON: decodeBase64(clientDataJSON),
			credentialId: decodeBase64(credentialId),
			signature: decodeBase64(signature)
		};
	} catch {
		return null;
	}
}

interface ParsedAssertion {
	authenticatorData: Uint8Array;
	clientDataJSON: Uint8Array;
	credentialId: Uint8Array;
	signature: Uint8Array;
}
