import type { RequestEvent } from '@sveltejs/kit';
import { config } from '$lib/server/env';
import { ApiError, clientAddress } from '$lib/server/http';
import { verifyTurnstileToken } from './turnstile-verify';

/** Name of the form field the Turnstile widget fills in on dashboard pages. */
export const TURNSTILE_FORM_FIELD = 'cf-turnstile-response';

export function turnstileSiteKey(): string | null {
	return config.turnstileEnabled ? config.turnstileSiteKey : null;
}

/**
 * Verifies a Turnstile token when bot protection is configured. Does nothing
 * when the keys are not set. Throws an ApiError with a user-facing message on
 * failure; dashboard form actions convert that into a `fail()`.
 */
export async function requireTurnstile(event: Pick<RequestEvent, 'getClientAddress'>, token: string | null | undefined): Promise<void> {
	if (!config.turnstileEnabled) return;
	const result = await verifyTurnstileToken({
		secret: config.turnstileSecretKey!,
		token,
		remoteIp: clientAddress(event as RequestEvent)
	});
	if (result.ok) return;
	if (result.reason === 'unavailable') {
		console.warn('[notette] Turnstile verification unavailable', result.codes ?? []);
		throw new ApiError(503, 'Verification service is unavailable, please try again shortly', 'turnstile_unavailable');
	}
	throw new ApiError(
		400,
		result.reason === 'missing_token'
			? 'Please complete the verification challenge'
			: 'Verification failed, please try again',
		'turnstile_failed'
	);
}
