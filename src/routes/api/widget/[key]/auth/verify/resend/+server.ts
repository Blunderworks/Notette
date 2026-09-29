import { json } from '@sveltejs/kit';
import { config } from '$lib/server/env';
import { ApiError, api, clientNetwork, readJson } from '$lib/server/http';
import { rateLimit } from '$lib/server/rate-limit';
import { resendVerificationEmail } from '$lib/server/services/email-verification';
import { resendVerificationSchema } from '$lib/server/validation';

/**
 * Sends a fresh confirmation link to an unverified account. Always answers
 * `{ ok: true }` for well-formed requests so it cannot be used to discover
 * which addresses have accounts.
 */
export const POST = api(async (event) => {
	const limit = rateLimit(`verify-resend:${clientNetwork(event)}`, 5, 15 * 60 * 1000);
	if (!limit.ok) {
		throw new ApiError(429, 'Too many requests, please try again later', 'rate_limited', {
			retryAfter: limit.retryAfter
		});
	}
	const input = await readJson(event.request, resendVerificationSchema);
	// Per-address cap so the endpoint cannot be used to flood someone's inbox from many networks.
	if (!rateLimit(`verify-resend-email:${input.email}`, 3, 60 * 60 * 1000).ok) {
		return json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
	}
	if (config.verificationEmailEnabled) {
		try {
			await resendVerificationEmail(input.email);
		} catch (err) {
			console.error('[notette] Could not resend verification email', err);
			throw new ApiError(503, 'Could not send the email right now, please try again later', 'email_unavailable');
		}
	}
	return json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
});
