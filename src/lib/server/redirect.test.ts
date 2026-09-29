import { describe, expect, it } from 'vitest';
import { safeRedirectTarget } from './redirect';

describe('safeRedirectTarget', () => {
	it('keeps same-site paths with query and hash', () => {
		expect(safeRedirectTarget('/projects/1/settings?tab=a#x')).toBe('/projects/1/settings?tab=a#x');
		expect(safeRedirectTarget('/')).toBe('/');
	});

	it('rejects anything a browser could resolve to another origin', () => {
		for (const raw of ['//evil.com', '/\t/evil.com', '/\n/evil.com', '/\r/evil.com', '/\\evil.com', '/ /evil.com', 'https://evil.com', 'evil.com']) {
			expect(safeRedirectTarget(raw), JSON.stringify(raw)).toBe('/');
		}
	});

	it('falls back for empty input', () => {
		expect(safeRedirectTarget(null, '/home')).toBe('/home');
		expect(safeRedirectTarget('', '/home')).toBe('/home');
	});
});
