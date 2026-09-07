import { json } from '@sveltejs/kit';
import { ApiError, api, clientAddress, readJson } from '$lib/server/http';
import { baseUrl } from '$lib/server/base-url';
import { rateLimit } from '$lib/server/rate-limit';
import { createAuthRequest } from '$lib/server/services/auth-requests';
import { authRequestCreateSchema } from '$lib/server/validation';

export const POST = api(async (event) => {
	const { project, origin } = event.locals.widget!;
	const limit = rateLimit(`auth-request:${clientAddress(event)}`, 20, 10 * 60 * 1000);
	if (!limit.ok) {
		throw new ApiError(429, 'Too many sign-in attempts', 'rate_limited', { retryAfter: limit.retryAfter });
	}
	const input = await readJson(event.request, authRequestCreateSchema);
	const request = await createAuthRequest({
		id: input.id,
		projectId: project.id,
		origin,
		pollSecret: input.pollSecret
	});
	return json(
		{
			id: request.id,
			expiresAt: request.expiresAt.toISOString(),
			authorizeUrl: `${baseUrl(event)}/widget/authorize?request=${encodeURIComponent(request.id)}`
		},
		{ status: 201 }
	);
});
