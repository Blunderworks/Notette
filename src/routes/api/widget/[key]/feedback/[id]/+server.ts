import { json } from '@sveltejs/kit';
import { ApiError, api, readJson, requireUser } from '$lib/server/http';
import { baseUrl } from '$lib/server/base-url';
import { deleteFeedback, getFeedbackThread, setFeedbackStatus, toDetailDto } from '$lib/server/services/feedback';
import { feedbackPatchSchema } from '$lib/server/validation';
import { loadWidgetThread } from '$lib/server/widget-thread';

export const GET = api(async (event) => {
	const thread = await loadWidgetThread(event);
	return json(toDetailDto(thread, baseUrl(event)), { headers: { 'Cache-Control': 'no-store' } });
});

export const PATCH = api(async (event) => {
	const user = requireUser(event);
	const thread = await loadWidgetThread(event);
	const input = await readJson(event.request, feedbackPatchSchema);
	await setFeedbackStatus(thread.item.id, input.status, user);
	const updated = await getFeedbackThread(thread.item.id);
	if (!updated) throw new ApiError(404, 'Feedback not found', 'not_found');
	return json(toDetailDto(updated, baseUrl(event)));
});

export const DELETE = api(async (event) => {
	requireUser(event);
	const thread = await loadWidgetThread(event);
	await deleteFeedback(thread.item.id);
	return new Response(null, { status: 204 });
});
