/**
 * Small in-memory fixed-window rate limiter. Adequate for a single-instance
 * self-hosted deployment; state is per process and resets on restart.
 */

interface Bucket {
	count: number;
	resetAt: number;
}

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

function sweep(now: number): void {
	if (now - lastSweep < 60_000) return;
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

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
	const now = Date.now();
	sweep(now);
	let bucket = buckets.get(key);
	if (!bucket || bucket.resetAt <= now) {
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

/** Test helper. */
export function resetRateLimits(): void {
	buckets.clear();
}
