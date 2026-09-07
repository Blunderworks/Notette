import { describe, expect, it } from 'vitest';
import {
	getRequestOrigin,
	isOriginAllowed,
	normalizeOrigin,
	normalizeOriginPattern,
	originMatches,
	parseAllowedOrigins
} from './origins';

describe('normalizeOrigin', () => {
	it('strips paths and lowercases', () => {
		expect(normalizeOrigin('HTTPS://Example.com/some/path?x=1')).toBe('https://example.com');
	});
	it('keeps non-default ports', () => {
		expect(normalizeOrigin('http://localhost:5173/')).toBe('http://localhost:5173');
	});
	it('rejects non-http schemes and garbage', () => {
		expect(normalizeOrigin('ftp://example.com')).toBeNull();
		expect(normalizeOrigin('not a url')).toBeNull();
		expect(normalizeOrigin('')).toBeNull();
	});
});

describe('normalizeOriginPattern', () => {
	it('adds https when the scheme is missing', () => {
		expect(normalizeOriginPattern('example.com')).toBe('https://example.com');
	});
	it('accepts wildcard hosts and ports', () => {
		expect(normalizeOriginPattern('https://*.vercel.app')).toBe('https://*.vercel.app');
		expect(normalizeOriginPattern('http://localhost:*')).toBe('http://localhost:*');
		expect(normalizeOriginPattern('*')).toBe('*');
	});
	it('rejects wildcard patterns with paths or invalid characters', () => {
		expect(normalizeOriginPattern('https://*.example.com/path')).toBe('https://*.example.com');
		expect(normalizeOriginPattern('https://*.exa mple.com')).toBeNull();
	});
});

describe('originMatches / isOriginAllowed', () => {
	it('matches exact origins only', () => {
		expect(originMatches('https://app.example.com', 'https://app.example.com')).toBe(true);
		expect(originMatches('https://app.example.com', 'https://example.com')).toBe(false);
		expect(originMatches('http://app.example.com', 'https://app.example.com')).toBe(false);
	});
	it('matches wildcard subdomains but not suffix tricks', () => {
		expect(originMatches('https://pr-42.vercel.app', 'https://*.vercel.app')).toBe(true);
		expect(originMatches('https://a.b.vercel.app', 'https://*.vercel.app')).toBe(true);
		expect(originMatches('https://vercel.app', 'https://*.vercel.app')).toBe(false);
		expect(originMatches('https://x.vercel.app.evil.com', 'https://*.vercel.app')).toBe(false);
	});
	it('matches wildcard ports', () => {
		expect(originMatches('http://localhost:3000', 'http://localhost:*')).toBe(true);
		expect(originMatches('http://localhost', 'http://localhost:*')).toBe(false);
	});
	it('allows everything with a lone star', () => {
		expect(isOriginAllowed('https://anything.test', ['*'])).toBe(true);
	});
	it('normalizes the origin before matching', () => {
		expect(isOriginAllowed('https://APP.example.com/', ['https://app.example.com'])).toBe(true);
		expect(isOriginAllowed(null, ['*'])).toBe(false);
	});
});

describe('parseAllowedOrigins', () => {
	it('splits on newlines and commas, dedupes and reports invalid entries', () => {
		const result = parseAllowedOrigins('https://a.com\nhttps://a.com, b.com\n\n::bad::');
		expect(result.origins).toEqual(['https://a.com', 'https://b.com']);
		expect(result.invalid).toEqual(['::bad::']);
	});
});

describe('getRequestOrigin', () => {
	it('prefers the Origin header and falls back to Referer', () => {
		expect(getRequestOrigin(new Request('https://api.test/x', { headers: { origin: 'https://site.test' } }))).toBe(
			'https://site.test'
		);
		expect(
			getRequestOrigin(new Request('https://api.test/x', { headers: { referer: 'https://site.test/page?q=1' } }))
		).toBe('https://site.test');
		expect(getRequestOrigin(new Request('https://api.test/x'))).toBeNull();
		expect(getRequestOrigin(new Request('https://api.test/x', { headers: { origin: 'null' } }))).toBeNull();
	});
});
