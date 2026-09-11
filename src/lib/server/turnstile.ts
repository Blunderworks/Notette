import type { RequestEvent } from '@sveltejs/kit';
import type { Project } from '$lib/server/db/schema';
import { ApiError, clientAddress } from '$lib/server/http';
import { verifyTurnstileToken } from './turnstile-verify';

type TurnstileProject = Pick<Project, 'turnstileSiteKey' | 'turnstileSecretKey'>;

export function turnstileSiteKey(project: TurnstileProject): string | null {
	return project.turnstileSiteKey && project.turnstileSecretKey ? project.turnstileSiteKey : null;
}

/**
 * Verifies a Turnstile token when bot protection is configured. Does nothing
 * when the keys are not set. Throws an ApiError with a user-facing message on
 * failure.
 */
export async function requireTurnstile(event: Pick<RequestEvent, 'getClientAddress'>, project: TurnstileProject, token: string | null | undefined): Promise<void> {
	if (!turnstileSiteKey(project)) return;
	const result = await verifyTurnstileToken({
		secret: project.turnstileSecretKey!,
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
