import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback) as (
	password: string | Buffer,
	salt: Buffer,
	keylen: number,
	options: { N: number; r: number; p: number; maxmem: number }
) => Promise<Buffer>;

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const MAX_MEM = 64 * 1024 * 1024;

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 200;

/**
 * Hashes a password with scrypt (Node built-in, no native dependencies).
 * Format: scrypt$N$r$p$<salt b64>$<hash b64>
 */
export async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(16);
	const key = await scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, {
		N: SCRYPT_N,
		r: SCRYPT_R,
		p: SCRYPT_P,
		maxmem: MAX_MEM
	});
	return ['scrypt', SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	const parts = stored.split('$');
	if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
	const N = Number.parseInt(parts[1], 10);
	const r = Number.parseInt(parts[2], 10);
	const p = Number.parseInt(parts[3], 10);
	if (![N, r, p].every((n) => Number.isFinite(n) && n > 0)) return false;
	const salt = Buffer.from(parts[4], 'base64');
	const expected = Buffer.from(parts[5], 'base64');
	if (salt.length === 0 || expected.length === 0) return false;
	try {
		const actual = await scrypt(password.normalize('NFKC'), salt, expected.length, {
			N,
			r,
			p,
			maxmem: MAX_MEM
		});
		return actual.length === expected.length && timingSafeEqual(actual, expected);
	} catch {
		return false;
	}
}
