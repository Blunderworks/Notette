import { describe, expect, it, vi } from 'vitest';
import { TURNSTILE_VERIFY_URL, verifyTurnstileToken } from './turnstile-verify';

function fakeFetch(status: number, body: unknown): typeof fetch {
	return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch;
}

describe('verifyTurnstileToken', () => {
	it('rejects missing tokens without calling Cloudflare', async () => {
		const fetchImpl = fakeFetch(200, { success: true });
		const result = await verifyTurnstileToken({ secret: 's', token: '' }, fetchImpl);
		expect(result).toEqual({ ok: false, reason: 'missing_token' });
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it('rejects oversized tokens', async () => {
		const fetchImpl = fakeFetch(200, { success: true });
		const result = await verifyTurnstileToken({ secret: 's', token: 'x'.repeat(5000) }, fetchImpl);
		expect(result.ok).toBe(false);
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it('posts secret, response and remote ip to the siteverify endpoint', async () => {
		const fetchImpl = fakeFetch(200, { success: true });
		const result = await verifyTurnstileToken({ secret: 'sec', token: 'tok', remoteIp: '203.0.113.9' }, fetchImpl);
		expect(result).toEqual({ ok: true });
		const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
		expect(url).toBe(TURNSTILE_VERIFY_URL);
		const params = new URLSearchParams(String(init.body));
		expect(params.get('secret')).toBe('sec');
		expect(params.get('response')).toBe('tok');
		expect(params.get('remoteip')).toBe('203.0.113.9');
	});

	it('omits an unknown remote ip', async () => {
		const fetchImpl = fakeFetch(200, { success: true });
		await verifyTurnstileToken({ secret: 'sec', token: 'tok', remoteIp: 'unknown' }, fetchImpl);
		const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
		expect(new URLSearchParams(String(init.body)).has('remoteip')).toBe(false);
	});

	it('reports invalid tokens', async () => {
		const fetchImpl = fakeFetch(200, { success: false, 'error-codes': ['invalid-input-response'] });
		const result = await verifyTurnstileToken({ secret: 'sec', token: 'tok' }, fetchImpl);
		expect(result).toEqual({ ok: false, reason: 'invalid_token', codes: ['invalid-input-response'] });
	});

	it('treats a bad secret as a service problem, not a user error', async () => {
		const fetchImpl = fakeFetch(200, { success: false, 'error-codes': ['invalid-input-secret'] });
		const result = await verifyTurnstileToken({ secret: 'bad', token: 'tok' }, fetchImpl);
		expect(result.ok).toBe(false);
		expect((result as { reason: string }).reason).toBe('unavailable');
	});

	it('treats network failures and non-2xx responses as unavailable', async () => {
		const failing = vi.fn(async () => {
			throw new Error('boom');
		}) as unknown as typeof fetch;
		expect(await verifyTurnstileToken({ secret: 's', token: 't' }, failing)).toEqual({ ok: false, reason: 'unavailable' });
		expect(await verifyTurnstileToken({ secret: 's', token: 't' }, fakeFetch(503, {}))).toEqual({ ok: false, reason: 'unavailable' });
	});
});
