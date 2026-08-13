import type {
	AuthenticationResponseJSON,
	PublicKeyCredentialCreationOptionsJSON,
	PublicKeyCredentialRequestOptionsJSON,
	RegistrationResponseJSON
} from '@simplewebauthn/browser';
import * as v from 'valibot';

const publicKeyCredentialTypeSchema = v.literal('public-key');
const authenticatorAttachmentSchema = v.picklist(['cross-platform', 'platform']);
const authenticatorTransportSchema = v.picklist([
	'ble',
	'cable',
	'hybrid',
	'internal',
	'nfc',
	'smart-card',
	'usb'
]);
const userVerificationSchema = v.picklist(['discouraged', 'preferred', 'required']);
const clientExtensionInputsSchema = v.object({
	appid: v.optional(v.string()),
	credProps: v.optional(v.boolean()),
	hmacCreateSecret: v.optional(v.boolean()),
	minPinLength: v.optional(v.boolean())
});
const clientExtensionOutputsSchema = v.object({
	appid: v.optional(v.boolean()),
	credProps: v.optional(v.object({ rk: v.optional(v.boolean()) })),
	hmacCreateSecret: v.optional(v.boolean())
});
const credentialDescriptorSchema = v.object({
	id: v.string(),
	type: publicKeyCredentialTypeSchema,
	transports: v.optional(v.array(authenticatorTransportSchema))
});

const authenticationResponseSchema = v.object({
	id: v.string(),
	rawId: v.string(),
	type: publicKeyCredentialTypeSchema,
	authenticatorAttachment: v.optional(authenticatorAttachmentSchema),
	clientExtensionResults: clientExtensionOutputsSchema,
	response: v.object({
		clientDataJSON: v.string(),
		authenticatorData: v.string(),
		signature: v.string(),
		userHandle: v.optional(v.string())
	})
});

const registrationResponseSchema = v.object({
	id: v.string(),
	rawId: v.string(),
	type: publicKeyCredentialTypeSchema,
	authenticatorAttachment: v.optional(authenticatorAttachmentSchema),
	clientExtensionResults: clientExtensionOutputsSchema,
	response: v.object({
		clientDataJSON: v.string(),
		attestationObject: v.string(),
		authenticatorData: v.optional(v.string()),
		transports: v.optional(v.array(authenticatorTransportSchema)),
		publicKeyAlgorithm: v.optional(v.number()),
		publicKey: v.optional(v.string())
	})
});

const authenticationOptionsSchema = v.object({
	challenge: v.string(),
	timeout: v.optional(v.number()),
	rpId: v.optional(v.string()),
	allowCredentials: v.optional(v.array(credentialDescriptorSchema)),
	userVerification: v.optional(userVerificationSchema),
	hints: v.optional(v.array(v.picklist(['hybrid', 'security-key', 'client-device']))),
	extensions: v.optional(clientExtensionInputsSchema)
});

const registrationOptionsSchema = v.object({
	rp: v.object({ name: v.string(), id: v.optional(v.string()) }),
	user: v.object({ id: v.string(), name: v.string(), displayName: v.string() }),
	challenge: v.string(),
	pubKeyCredParams: v.array(v.object({ alg: v.number(), type: publicKeyCredentialTypeSchema })),
	timeout: v.optional(v.number()),
	excludeCredentials: v.optional(v.array(credentialDescriptorSchema)),
	authenticatorSelection: v.optional(
		v.object({
			authenticatorAttachment: v.optional(authenticatorAttachmentSchema),
			requireResidentKey: v.optional(v.boolean()),
			residentKey: v.optional(v.picklist(['discouraged', 'preferred', 'required'])),
			userVerification: v.optional(userVerificationSchema)
		})
	),
	hints: v.optional(v.array(v.picklist(['hybrid', 'security-key', 'client-device']))),
	attestation: v.optional(v.picklist(['direct', 'enterprise', 'indirect', 'none'])),
	attestationFormats: v.optional(
		v.array(
			v.picklist(['fido-u2f', 'packed', 'android-safetynet', 'android-key', 'tpm', 'apple', 'none'])
		)
	),
	extensions: v.optional(clientExtensionInputsSchema)
});

export function parseAuthenticationResponse(value: unknown): AuthenticationResponseJSON | null {
	const result = v.safeParse(authenticationResponseSchema, value);
	return result.success ? result.output : null;
}

export function parseRegistrationResponse(value: unknown): RegistrationResponseJSON | null {
	const result = v.safeParse(registrationResponseSchema, value);
	return result.success ? result.output : null;
}

export function parseAuthenticationOptions(
	value: unknown
): PublicKeyCredentialRequestOptionsJSON | null {
	const result = v.safeParse(authenticationOptionsSchema, value);
	return result.success ? result.output : null;
}

export function parseRegistrationOptions(
	value: unknown
): PublicKeyCredentialCreationOptionsJSON | null {
	const result = v.safeParse(registrationOptionsSchema, value);
	return result.success ? result.output : null;
}
