import { createHash, randomBytes, randomUUID } from 'node:crypto';

const ALPHANUMERIC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** Random URL-safe token (base64url) with an optional prefix, suitable for secrets. */
export function randomToken(bytes = 32, prefix = ''): string {
	return prefix + randomBytes(bytes).toString('base64url');
}

/** Public, non-secret project identifier used by the widget (e.g. ntk_…). */
export function generateClientKey(): string {
	const raw = randomBytes(24);
	let out = 'ntk_';
	for (const byte of raw) out += ALPHANUMERIC[byte % ALPHANUMERIC.length];
	return out;
}

export function sha256(input: string): string {
	return createHash('sha256').update(input).digest('hex');
}

export function uuid(): string {
	return randomUUID();
}

export function isUuid(value: unknown): value is string {
	return (
		typeof value === 'string' &&
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
	);
}
