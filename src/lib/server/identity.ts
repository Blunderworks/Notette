import { createPublicKey, type KeyObject } from 'node:crypto';
import { createRemoteJWKSet, errors, jwtVerify, type JWTPayload, type JWTVerifyGetKey, type JWTVerifyOptions } from 'jose';
import type { Project } from '$lib/server/db/schema';
import { randomToken } from '$lib/server/ids';
import { emailSchema, singleLine } from '$lib/server/validation';

/**
 * Identity verification: the host app's backend signs a short-lived JWT for
 * its signed-in user and the widget sends it as the bearer credential. A
 * verified token attributes feedback to that user (`sub`, `name`, `email`)
 * without creating a Notette account. Claims never map onto Notette users.
 */

export type IdentityConfig = Pick<
	Project,
	| 'clientKey'
	| 'identityMode'
	| 'identitySecret'
	| 'identityPreviousSecret'
	| 'identityPublicKey'
	| 'identityJwksUrl'
	| 'identityIssuer'
	| 'identityAudience'
>;

export interface VerifiedIdentity {
	/** The token's `sub`: the user's id in the host app. */
	id: string;
	name: string | null;
	email: string | null;
}

export type IdentityResult =
	| { ok: true; identity: VerifiedIdentity }
	| { ok: false; status: 401 | 503; code: 'identity_invalid' | 'identity_unavailable'; message: string };

/** Accepted clock difference between the host app and this server. */
const CLOCK_TOLERANCE_SECONDS = 60;
const MAX_TOKEN_LENGTH = 8192;
const RSA_ALGORITHMS = ['RS256', 'RS384', 'RS512', 'PS256', 'PS384', 'PS512'];
const ASYMMETRIC_ALGORITHMS = [...RSA_ALGORITHMS, 'ES256', 'ES384', 'ES512', 'EdDSA', 'Ed25519'];

/** Compact JWS (three base64url segments). Widget session tokens (`ntw_…`) never match. */
export function isIdentityToken(value: string): boolean {
	return value.length <= MAX_TOKEN_LENGTH && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);
}

export function generateIdentitySecret(): string {
	return randomToken(32, 'ntis_');
}

export interface PublicKeyInfo {
	key: KeyObject;
	/** The only JWS algorithms tokens verified with this key may use. */
	algorithms: string[];
	label: string;
}

/**
 * Parses an SPKI PEM (or X.509 certificate) and pins the algorithms it may
 * verify. Returns an error message for private keys, weak RSA keys and
 * unsupported key types.
 */
export function parsePublicKey(pem: string): PublicKeyInfo | { error: string } {
	const text = pem.trim();
	if (/PRIVATE KEY/.test(text)) return { error: 'That is a private key. Paste the matching public key instead.' };
	let key: KeyObject;
	try {
		key = createPublicKey(text);
	} catch {
		return { error: 'Could not read the public key. Paste a PEM block starting with -----BEGIN PUBLIC KEY-----.' };
	}
	const details = key.asymmetricKeyDetails;
	switch (key.asymmetricKeyType) {
		case 'rsa':
		case 'rsa-pss': {
			if ((details?.modulusLength ?? 0) < 2048) return { error: 'RSA keys must be at least 2048 bits.' };
			const pss = key.asymmetricKeyType === 'rsa-pss';
			return { key, algorithms: pss ? RSA_ALGORITHMS.filter((a) => a.startsWith('PS')) : RSA_ALGORITHMS, label: pss ? 'RSA-PSS' : 'RSA' };
		}
		case 'ec': {
			const alg = { prime256v1: 'ES256', secp384r1: 'ES384', secp521r1: 'ES512' }[details?.namedCurve ?? ''];
			return alg ? { key, algorithms: [alg], label: `EC (${alg})` } : { error: 'Unsupported elliptic curve. Use P-256, P-384 or P-521.' };
		}
		case 'ed25519':
			return { key, algorithms: ['EdDSA', 'Ed25519'], label: 'Ed25519 (EdDSA)' };
		default:
			return { error: 'Unsupported key type. Use an RSA, EC (P-256/P-384/P-521) or Ed25519 public key.' };
	}
}

/** JWKS endpoints must use HTTPS; plain HTTP is only accepted for local development hosts. */
export function normalizeJwksUrl(input: string): string | null {
	let url: URL;
	try {
		url = new URL(input.trim());
	} catch {
		return null;
	}
	const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
	if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) return null;
	if (url.username || url.password) return null;
	url.hash = '';
	return url.toString();
}

const jwksCache = new Map<string, JWTVerifyGetKey>();
/** Parsed project keys by PEM so each request does not re-parse the key. */
const publicKeyCache = new Map<string, PublicKeyInfo | { error: string }>();

function cachedPublicKey(pem: string): PublicKeyInfo | { error: string } {
	let parsed = publicKeyCache.get(pem);
	if (!parsed) {
		if (publicKeyCache.size >= 100) publicKeyCache.clear();
		parsed = parsePublicKey(pem);
		publicKeyCache.set(pem, parsed);
	}
	return parsed;
}

function remoteJwks(url: string): JWTVerifyGetKey {
	let keySet = jwksCache.get(url);
	if (!keySet) {
		// Settings changes can leave stale entries; a small bound keeps the cache from growing unchecked.
		if (jwksCache.size >= 100) jwksCache.clear();
		keySet = createRemoteJWKSet(new URL(url), {
			timeoutDuration: 5000,
			cooldownDuration: 30_000,
			cacheMaxAge: 10 * 60_000
		});
		jwksCache.set(url, keySet);
	}
	return keySet;
}

function invalid(message: string): IdentityResult {
	return { ok: false, status: 401, code: 'identity_invalid', message };
}

function trimmed(value: unknown, max: number): string | null {
	if (typeof value !== 'string') return null;
	const text = singleLine(value);
	return text ? text.slice(0, max) : null;
}

/** Maps verified claims onto the author identity; standard OIDC names are used as fallbacks. */
export function identityFromClaims(payload: JWTPayload): VerifiedIdentity | { error: string } {
	const id = typeof payload.sub === 'string' ? payload.sub.trim() : '';
	if (!id || id.length > 255) return { error: 'Identity token "sub" must be a non-empty string of at most 255 characters' };
	const given = [trimmed(payload.given_name, 60), trimmed(payload.family_name, 60)].filter(Boolean).join(' ');
	const name = trimmed(payload.name, 120) ?? (given || null) ?? trimmed(payload.preferred_username, 120) ?? trimmed(payload.nickname, 120);
	// An address the token itself marks as unverified is not attributed.
	const email = payload.email_verified === false ? null : emailSchema.safeParse(payload.email).data ?? null;
	return { id, name, email };
}

async function verifyWithSecrets(token: string, secrets: string[], options: JWTVerifyOptions): Promise<JWTPayload> {
	let lastError: unknown;
	for (const secret of secrets) {
		try {
			return (await jwtVerify(token, new TextEncoder().encode(secret), options)).payload;
		} catch (err) {
			// Signature checks precede claim checks, so only a signature mismatch means "try the other secret".
			if (!(err instanceof errors.JWSSignatureVerificationFailed)) throw err;
			lastError = err;
		}
	}
	throw lastError;
}

function describeError(err: unknown): IdentityResult {
	if (err instanceof errors.JWTExpired) return invalid('Identity token has expired');
	if (err instanceof errors.JWTClaimValidationFailed) return invalid(`Identity token rejected: ${err.message}`);
	if (err instanceof errors.JWSSignatureVerificationFailed) return invalid('Identity token signature is invalid');
	if (err instanceof errors.JOSEAlgNotAllowed) return invalid('Identity token algorithm is not allowed for this project');
	if (err instanceof errors.JWKSNoMatchingKey) return invalid('No key in the JWKS matches the identity token');
	if (err instanceof errors.JWKSMultipleMatchingKeys) return invalid('Several JWKS keys match the identity token; add a "kid" header');
	if (err instanceof errors.JWKSTimeout || err instanceof errors.JWKSInvalid) {
		return { ok: false, status: 503, code: 'identity_unavailable', message: 'Could not load the identity signing keys' };
	}
	if (err instanceof errors.JOSEError) return invalid(`Identity token rejected: ${err.message}`);
	// Anything else is an infrastructure failure (e.g. the JWKS fetch), not a bad token.
	console.warn('[notette] Identity verification failed', err);
	return { ok: false, status: 503, code: 'identity_unavailable', message: 'Could not verify the identity token right now' };
}

/**
 * Verifies a host-signed identity token against the project's settings.
 * `secret` and `public_key` modes accept an `aud` claim only when it names
 * the project's client key; `jwks` mode requires the configured issuer and
 * audience. `exp` and `sub` are always required.
 */
export async function verifyIdentityToken(
	config: IdentityConfig,
	token: string,
	opts: { jwks?: JWTVerifyGetKey } = {}
): Promise<IdentityResult> {
	const base: JWTVerifyOptions = { clockTolerance: CLOCK_TOLERANCE_SECONDS, requiredClaims: ['exp', 'sub'] };
	let payload: JWTPayload;
	try {
		switch (config.identityMode) {
			case 'secret': {
				const secrets = [config.identitySecret, config.identityPreviousSecret].filter((s): s is string => !!s);
				if (!secrets.length) return invalid('Identity verification is not set up for this project');
				payload = await verifyWithSecrets(token, secrets, { ...base, algorithms: ['HS256'] });
				break;
			}
			case 'public_key': {
				const parsed = config.identityPublicKey ? cachedPublicKey(config.identityPublicKey) : null;
				if (!parsed || 'error' in parsed) return invalid('Identity verification is not set up for this project');
				payload = (await jwtVerify(token, parsed.key, { ...base, algorithms: parsed.algorithms })).payload;
				break;
			}
			case 'jwks': {
				if (!config.identityJwksUrl || !config.identityIssuer || !config.identityAudience) {
					return invalid('Identity verification is not set up for this project');
				}
				const keys = opts.jwks ?? remoteJwks(config.identityJwksUrl);
				payload = (
					await jwtVerify(token, keys, {
						...base,
						algorithms: ASYMMETRIC_ALGORITHMS,
						issuer: config.identityIssuer,
						audience: config.identityAudience
					})
				).payload;
				break;
			}
			default:
				return invalid('Identity verification is not enabled for this project');
		}
	} catch (err) {
		return describeError(err);
	}

	if (config.identityMode !== 'jwks' && payload.aud !== undefined) {
		const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
		if (!audiences.includes(config.clientKey)) return invalid('Identity token audience does not match this project');
	}
	const identity = identityFromClaims(payload);
	if ('error' in identity) return invalid(identity.error);
	return { ok: true, identity };
}
