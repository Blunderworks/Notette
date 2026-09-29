/**
 * Small in-memory fixed-window rate limiter. Adequate for a single-instance
 * self-hosted deployment; state is per process and resets on restart.
 */

interface Bucket {
	count: number;
	resetAt: number;
}

/** Upper bound on tracked keys so spoofed or rotating addresses cannot exhaust memory. */
const MAX_BUCKETS = 50_000;
const MAX_KEY_LENGTH = 200;

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

function sweep(now: number, force = false): void {
	if (!force && now - lastSweep < 60_000) return;
	lastSweep = now;
	for (const [key, bucket] of buckets) {
		if (bucket.resetAt <= now) buckets.delete(key);
	}
}

export interface RateLimitResult {
	ok: boolean;
	remaining: number;
	/** Seconds until the window resets. */
	retryAfter: number;
}

export function rateLimit(rawKey: string, limit: number, windowMs: number): RateLimitResult {
	const key = rawKey.slice(0, MAX_KEY_LENGTH);
	const now = Date.now();
	sweep(now);
	let bucket = buckets.get(key);
	if (!bucket || bucket.resetAt <= now) {
		if (!bucket && buckets.size >= MAX_BUCKETS) {
			sweep(now, true);
			// Still full: drop the oldest tenth (Map iteration follows insertion order).
			if (buckets.size >= MAX_BUCKETS) {
				let drop = Math.ceil(MAX_BUCKETS / 10);
				for (const oldest of buckets.keys()) {
					buckets.delete(oldest);
					if (--drop === 0) break;
				}
			}
		}
		bucket = { count: 0, resetAt: now + windowMs };
		buckets.set(key, bucket);
	}
	bucket.count += 1;
	const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
	return {
		ok: bucket.count <= limit,
		remaining: Math.max(0, limit - bucket.count),
		retryAfter
	};
}

/**
 * Rate-limit identity for a client address. IPv6 clients usually control a
 * whole /64, so they share one bucket per /64; IPv4-mapped addresses count
 * as IPv4.
 */
export function addressBucket(address: string): string {
	const value = address.trim().toLowerCase().split('%')[0];
	const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(value);
	if (mapped) return mapped[1];
	if (!value.includes(':')) return value.slice(0, 64);
	const [head, tail] = value.split('::');
	const headParts = head ? head.split(':') : [];
	const tailParts = tail ? tail.split(':') : [];
	const fill = tail === undefined ? [] : Array<string>(Math.max(0, 8 - headParts.length - tailParts.length)).fill('0');
	const parts = [...headParts, ...fill, ...tailParts];
	if (parts.length !== 8 || !parts.every((p) => /^[0-9a-f]{1,4}$/.test(p))) return value.slice(0, 64);
	return `${parts
		.slice(0, 4)
		.map((p) => p.replace(/^0+(?=.)/, ''))
		.join(':')}::/64`;
}

/** Test helper. */
export function resetRateLimits(): void {
	buckets.clear();
}
