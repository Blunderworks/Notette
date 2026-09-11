/**
 * Cloudflare Turnstile server-side verification. Kept free of environment and
 * database imports so it can be unit-tested; `turnstile.ts` wires it to the
 * project configuration.
 */

export const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Turnstile tokens are at most 2048 characters per Cloudflare's documentation. */
export const TURNSTILE_TOKEN_MAX_LENGTH = 2048;

export type TurnstileVerification =
	| { ok: true }
	| { ok: false; reason: 'missing_token' | 'invalid_token' | 'unavailable'; codes?: string[] };

interface SiteVerifyResponse {
	success?: boolean;
	'error-codes'?: string[];
}

export async function verifyTurnstileToken(
	input: { secret: string; token: string | null | undefined; remoteIp?: string | null },
	fetchImpl: typeof fetch = fetch,
	timeoutMs = 10_000
): Promise<TurnstileVerification> {
	const token = input.token?.trim() ?? '';
	if (!token || token.length > TURNSTILE_TOKEN_MAX_LENGTH) return { ok: false, reason: 'missing_token' };

	const body = new URLSearchParams({ secret: input.secret, response: token });
	if (input.remoteIp && input.remoteIp !== 'unknown') body.set('remoteip', input.remoteIp);

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetchImpl(TURNSTILE_VERIFY_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: body.toString(),
			signal: controller.signal
		});
		if (!response.ok) return { ok: false, reason: 'unavailable' };
		const data = (await response.json()) as SiteVerifyResponse;
		if (data.success === true) return { ok: true };
		const codes = data['error-codes'] ?? [];
		// Cloudflare-side problems (bad secret, internal error) are reported as
		// unavailable so operators notice misconfiguration instead of blaming users.
		const serverSide = codes.some((c) => c === 'invalid-input-secret' || c === 'missing-input-secret' || c === 'internal-error');
		return { ok: false, reason: serverSide ? 'unavailable' : 'invalid_token', codes };
	} catch {
		return { ok: false, reason: 'unavailable' };
	} finally {
		clearTimeout(timer);
	}
}
