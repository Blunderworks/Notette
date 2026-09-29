import { beforeEach, describe, expect, it } from 'vitest';
import { addressBucket, rateLimit, resetRateLimits } from './rate-limit';

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

	it('treats keys that only differ past the length cap as one bucket', () => {
		const long = 'x'.repeat(300);
		rateLimit(`${long}a`, 1, 60_000);
		expect(rateLimit(`${long}b`, 1, 60_000).ok).toBe(false);
	});

	it('stays bounded when flooded with distinct keys', () => {
		for (let i = 0; i < 60_000; i++) rateLimit(`flood:${i}`, 1, 60_000);
		// The newest keys are still tracked after eviction.
		expect(rateLimit('flood:59999', 1, 60_000).ok).toBe(false);
	});
});

describe('addressBucket', () => {
	it('groups IPv6 addresses by /64', () => {
		expect(addressBucket('2001:db8:1:2:aaaa:bbbb:cccc:dddd')).toBe('2001:db8:1:2::/64');
		expect(addressBucket('2001:0db8:0001:0002::1')).toBe('2001:db8:1:2::/64');
		expect(addressBucket('2001:db8:1:2::ffff')).toBe(addressBucket('2001:db8:1:2:1:2:3:4'));
		expect(addressBucket('2001:db8::1')).toBe('2001:db8:0:0::/64');
		expect(addressBucket('fe80::1%eth0')).toBe('fe80:0:0:0::/64');
	});

	it('keeps IPv4 (including IPv4-mapped IPv6) as is', () => {
		expect(addressBucket('203.0.113.9')).toBe('203.0.113.9');
		expect(addressBucket('::ffff:203.0.113.9')).toBe('203.0.113.9');
	});

	it('truncates unparseable values', () => {
		expect(addressBucket('x'.repeat(500))).toHaveLength(64);
		expect(addressBucket('unknown')).toBe('unknown');
	});
});
