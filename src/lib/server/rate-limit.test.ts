import { beforeEach, describe, expect, it } from 'vitest';
import { rateLimit, resetRateLimits } from './rate-limit';

describe('rateLimit', () => {
	beforeEach(() => resetRateLimits());

	it('allows up to the limit and then blocks', () => {
		expect(rateLimit('k', 2, 60_000).ok).toBe(true);
		expect(rateLimit('k', 2, 60_000).ok).toBe(true);
		const third = rateLimit('k', 2, 60_000);
		expect(third.ok).toBe(false);
		expect(third.retryAfter).toBeGreaterThan(0);
	});

	it('tracks keys independently', () => {
		rateLimit('a', 1, 60_000);
		expect(rateLimit('a', 1, 60_000).ok).toBe(false);
		expect(rateLimit('b', 1, 60_000).ok).toBe(true);
	});
});
