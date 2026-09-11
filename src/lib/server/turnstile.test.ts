import { afterEach, describe, expect, it, vi } from 'vitest';
import { requireTurnstile, turnstileSiteKey } from './turnstile';

const event = { getClientAddress: () => '203.0.113.9' };
const projectA = { turnstileSiteKey: 'site-a', turnstileSecretKey: 'secret-a' };
const projectB = { turnstileSiteKey: 'site-b', turnstileSecretKey: 'secret-b' };
afterEach(() => vi.unstubAllGlobals());

describe('project Turnstile protection', () => {
	it('exposes only the selected project site key when both keys exist', () => {
		expect(turnstileSiteKey(projectA)).toBe('site-a');
		expect(turnstileSiteKey(projectB)).toBe('site-b');
		expect(turnstileSiteKey({ ...projectA, turnstileSecretKey: null })).toBeNull();
	});
	it('uses each project secret independently and skips disabled projects', async () => {
		const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true })));
		vi.stubGlobal('fetch', fetchMock);
		await requireTurnstile(event, projectA, 'token-a');
		await requireTurnstile(event, { turnstileSiteKey: null, turnstileSecretKey: null }, undefined);
		await requireTurnstile(event, projectB, 'token-b');
		expect(fetchMock).toHaveBeenCalledTimes(2);
		const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
		expect(new URLSearchParams(String(calls[0][1].body)).get('secret')).toBe('secret-a');
		expect(new URLSearchParams(String(calls[1][1].body)).get('secret')).toBe('secret-b');
	});
	it('rejects missing and invalid tokens for enabled projects', async () => {
		await expect(requireTurnstile(event, projectA, undefined)).rejects.toMatchObject({ status: 400, code: 'turnstile_failed' });
		vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }))));
		await expect(requireTurnstile(event, projectA, 'bad')).rejects.toMatchObject({ status: 400, code: 'turnstile_failed' });
	});
});
