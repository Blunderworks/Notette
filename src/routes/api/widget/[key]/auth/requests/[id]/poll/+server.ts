import { json } from '@sveltejs/kit';
import { ApiError, api, clientAddress, readJson } from '$lib/server/http';
import { isUuid } from '$lib/server/ids';
import { rateLimit } from '$lib/server/rate-limit';
import { pollAuthRequest } from '$lib/server/services/auth-requests';
import { authPollSchema } from '$lib/server/validation';

export const POST = api(async (event) => {
	const { project, origin } = event.locals.widget!;
	const id = event.params.id ?? '';
	if (!isUuid(id)) throw new ApiError(404, 'Auth request not found', 'not_found');
	const limit = rateLimit(`auth-poll:${clientAddress(event)}`, 900, 10 * 60 * 1000);
	if (!limit.ok) {
		throw new ApiError(429, 'Polling too fast', 'rate_limited', { retryAfter: limit.retryAfter });
	}
	const input = await readJson(event.request, authPollSchema);
	const { result } = await pollAuthRequest(id, input.pollSecret, project.id, origin);
	return json(result, { headers: { 'Cache-Control': 'no-store' } });
});
