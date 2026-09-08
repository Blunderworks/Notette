import { json } from '@sveltejs/kit';
import { baseUrl } from '$lib/server/base-url';
import { config } from '$lib/server/env';
import { ApiError, api, clientAddress, readJson } from '$lib/server/http';
import { rateLimit } from '$lib/server/rate-limit';
import { resendVerificationEmail } from '$lib/server/services/email-verification';
import { resendVerificationSchema } from '$lib/server/validation';

/**
 * Sends a fresh confirmation link to an unverified account. Always answers
 * `{ ok: true }` for well-formed requests so it cannot be used to discover
 * which addresses have accounts.
 */
export const POST = api(async (event) => {
	const limit = rateLimit(`verify-resend:${clientAddress(event)}`, 5, 15 * 60 * 1000);
	if (!limit.ok) {
		throw new ApiError(429, 'Too many requests, please try again later', 'rate_limited', {
			retryAfter: limit.retryAfter
		});
	}
	const input = await readJson(event.request, resendVerificationSchema);
	if (config.emailEnabled) {
		try {
			await resendVerificationEmail(input.email, baseUrl(event));
		} catch (err) {
			console.error('[notette] Could not resend verification email', err);
			throw new ApiError(503, 'Could not send the email right now, please try again later', 'email_unavailable');
		}
	}
	return json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
});
