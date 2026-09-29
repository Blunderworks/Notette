import { generateKeyPairSync } from 'node:crypto';
import { createLocalJWKSet, exportJWK, exportPKCS8, exportSPKI, generateKeyPair, SignJWT, type JWTPayload } from 'jose';
import { describe, expect, it } from 'vitest';
import {
	generateIdentitySecret,
	identityFromClaims,
	isIdentityToken,
	normalizeJwksUrl,
	parsePublicKey,
	verifyIdentityToken,
	type IdentityConfig
} from './identity';

const CLIENT_KEY = 'ntk_project';
const off: IdentityConfig = {
	clientKey: CLIENT_KEY,
	identityMode: 'off',
	identitySecret: null,
	identityPreviousSecret: null,
	identityPublicKey: null,
	identityJwksUrl: null,
	identityIssuer: null,
	identityAudience: null
};
const secret = 'ntis_current-secret-for-tests-0123456789';
const previous = 'ntis_previous-secret-for-tests-012345678';
const secretConfig: IdentityConfig = { ...off, identityMode: 'secret', identitySecret: secret };

function claims(extra: JWTPayload = {}): SignJWT {
	return new SignJWT({ name: 'Jane Doe', email: 'Jane@Example.com', ...extra })
		.setSubject('user-42')
		.setIssuedAt()
		.setExpirationTime('10m');
}

function hs256(key: string, jwt = claims()): Promise<string> {
	return jwt.setProtectedHeader({ alg: 'HS256' }).sign(new TextEncoder().encode(key));
}

describe('identity token verification: shared secret', () => {
	it('accepts a valid token and maps its claims', async () => {
		const result = await verifyIdentityToken(secretConfig, await hs256(secret));
		expect(result).toEqual({ ok: true, identity: { id: 'user-42', name: 'Jane Doe', email: 'jane@example.com' } });
	});

	it('accepts the previous secret during rotation and rejects unknown secrets', async () => {
		const rotating = { ...secretConfig, identityPreviousSecret: previous };
		expect((await verifyIdentityToken(rotating, await hs256(previous))).ok).toBe(true);
		expect(await verifyIdentityToken(secretConfig, await hs256(previous))).toMatchObject({ ok: false, status: 401, code: 'identity_invalid' });
		expect(await verifyIdentityToken(rotating, await hs256('ntis_someone-else'))).toMatchObject({
			ok: false,
			message: 'Identity token signature is invalid'
		});
	});

	it('requires exp and sub', async () => {
		const noExp = await new SignJWT({}).setSubject('u').setProtectedHeader({ alg: 'HS256' }).sign(new TextEncoder().encode(secret));
		expect(await verifyIdentityToken(secretConfig, noExp)).toMatchObject({ ok: false, code: 'identity_invalid' });
		const noSub = await new SignJWT({}).setExpirationTime('5m').setProtectedHeader({ alg: 'HS256' }).sign(new TextEncoder().encode(secret));
		expect(await verifyIdentityToken(secretConfig, noSub)).toMatchObject({ ok: false, code: 'identity_invalid' });
	});

	it('rejects expired tokens beyond the clock tolerance but allows small skew', async () => {
		const now = Math.floor(Date.now() / 1000);
		const expired = await hs256(secret, claims().setExpirationTime(now - 120));
		expect(await verifyIdentityToken(secretConfig, expired)).toMatchObject({ ok: false, message: 'Identity token has expired' });
		const skewed = await hs256(secret, claims().setExpirationTime(now - 30));
		expect((await verifyIdentityToken(secretConfig, skewed)).ok).toBe(true);
	});

	it('accepts an aud claim only when it names the project key', async () => {
		expect((await verifyIdentityToken(secretConfig, await hs256(secret, claims().setAudience(CLIENT_KEY)))).ok).toBe(true);
		expect((await verifyIdentityToken(secretConfig, await hs256(secret, claims().setAudience(['x', CLIENT_KEY])))).ok).toBe(true);
		expect(await verifyIdentityToken(secretConfig, await hs256(secret, claims().setAudience('ntk_other')))).toMatchObject({
			ok: false,
			message: 'Identity token audience does not match this project'
		});
	});

	it('rejects unsigned and asymmetric tokens in secret mode', async () => {
		const payload = (await hs256(secret)).split('.')[1];
		const none = `${Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url')}.${payload}.`;
		expect(isIdentityToken(none)).toBe(false);
		expect(await verifyIdentityToken(secretConfig, `${none}x`)).toMatchObject({ ok: false });
		const { privateKey } = await generateKeyPair('ES256');
		const es = await claims().setProtectedHeader({ alg: 'ES256' }).sign(privateKey);
		expect(await verifyIdentityToken(secretConfig, es)).toMatchObject({ ok: false, code: 'identity_invalid' });
	});

	it('does nothing when verification is off or unconfigured', async () => {
		const token = await hs256(secret);
		expect(await verifyIdentityToken(off, token)).toMatchObject({ ok: false, message: 'Identity verification is not enabled for this project' });
		expect(await verifyIdentityToken({ ...secretConfig, identitySecret: null }, token)).toMatchObject({ ok: false });
	});
});

describe('identity token verification: public key', () => {
	it('pins algorithms to the key type and blocks HMAC key confusion', async () => {
		const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
		const pem = await exportSPKI(publicKey);
		const config: IdentityConfig = { ...off, identityMode: 'public_key', identityPublicKey: pem };
		const rs = await claims().setProtectedHeader({ alg: 'RS256' }).sign(privateKey);
		expect((await verifyIdentityToken(config, rs)).ok).toBe(true);
		// Classic attack: HS256 signed with the public PEM as the HMAC secret.
		const confused = await hs256(pem);
		expect(await verifyIdentityToken(config, confused)).toMatchObject({ ok: false, code: 'identity_invalid' });
	});

	it('supports EC and Ed25519 keys', async () => {
		for (const alg of ['ES256', 'ES384', 'EdDSA'] as const) {
			const { publicKey, privateKey } = await generateKeyPair(alg, { extractable: true, crv: alg === 'EdDSA' ? 'Ed25519' : undefined });
			const config: IdentityConfig = { ...off, identityMode: 'public_key', identityPublicKey: await exportSPKI(publicKey) };
			const token = await claims().setProtectedHeader({ alg }).sign(privateKey);
			expect((await verifyIdentityToken(config, token)).ok, alg).toBe(true);
		}
	});

	it('rejects private keys, small RSA keys and garbage when parsing', async () => {
		const { privateKey } = await generateKeyPair('ES256', { extractable: true });
		expect(parsePublicKey(await exportPKCS8(privateKey))).toMatchObject({ error: expect.stringContaining('private key') });
		expect(parsePublicKey('not a key')).toMatchObject({ error: expect.any(String) });
		const small = generateKeyPairSync('rsa', { modulusLength: 1024 }).publicKey.export({ type: 'spki', format: 'pem' }).toString();
		expect(parsePublicKey(small)).toMatchObject({ error: 'RSA keys must be at least 2048 bits.' });
	});
});

describe('identity token verification: JWKS', () => {
	it('requires the configured issuer and audience', async () => {
		const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
		const jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' }] });
		const config: IdentityConfig = {
			...off,
			identityMode: 'jwks',
			identityJwksUrl: 'https://idp.example.com/.well-known/jwks.json',
			identityIssuer: 'https://idp.example.com/',
			identityAudience: 'my-app'
		};
		const sign = (iss: string, aud: string) =>
			claims().setIssuer(iss).setAudience(aud).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).sign(privateKey);
		expect((await verifyIdentityToken(config, await sign('https://idp.example.com/', 'my-app'), { jwks })).ok).toBe(true);
		expect((await verifyIdentityToken(config, await sign('https://evil.example.com/', 'my-app'), { jwks })).ok).toBe(false);
		expect((await verifyIdentityToken(config, await sign('https://idp.example.com/', 'other'), { jwks })).ok).toBe(false);
	});

	it('only accepts HTTPS JWKS URLs outside localhost', () => {
		expect(normalizeJwksUrl('https://idp.example.com/jwks.json#x')).toBe('https://idp.example.com/jwks.json');
		expect(normalizeJwksUrl('http://localhost:4000/jwks')).toBe('http://localhost:4000/jwks');
		expect(normalizeJwksUrl('http://idp.example.com/jwks')).toBeNull();
		expect(normalizeJwksUrl('https://user:pw@idp.example.com/jwks')).toBeNull();
		expect(normalizeJwksUrl('ftp://idp.example.com')).toBeNull();
	});
});

describe('identity claims and token shape', () => {
	it('falls back to OIDC name claims and drops unverified or invalid emails', () => {
		expect(identityFromClaims({ sub: ' 7 ', given_name: 'Ada', family_name: 'Lovelace', email: 'not-an-email' })).toEqual({
			id: '7',
			name: 'Ada Lovelace',
			email: null
		});
		expect(identityFromClaims({ sub: '8', preferred_username: 'ada', email: 'ada@example.com', email_verified: false })).toEqual({
			id: '8',
			name: 'ada',
			email: null
		});
		expect(identityFromClaims({ sub: '' })).toMatchObject({ error: expect.any(String) });
		expect(identityFromClaims({ sub: 'x'.repeat(256) })).toMatchObject({ error: expect.any(String) });
	});

	it('distinguishes JWTs from widget session tokens', () => {
		expect(isIdentityToken('ntw_abcDEF123-_')).toBe(false);
		expect(isIdentityToken('a.b.c')).toBe(true);
		expect(isIdentityToken(`a.${'b'.repeat(9000)}.c`)).toBe(false);
		expect(generateIdentitySecret()).toMatch(/^ntis_[A-Za-z0-9_-]{43}$/);
	});
});
