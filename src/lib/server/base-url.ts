import type { RequestEvent } from '@sveltejs/kit';
import { config } from '$lib/server/env';

/** Absolute base URL of this instance (no trailing slash). */
export function baseUrl(event: Pick<RequestEvent, 'url'>): string {
	return config.publicUrl ?? event.url.origin;
}
