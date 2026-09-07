import { json } from '@sveltejs/kit';
import { ApiError, api, clientAddress, readJson } from '$lib/server/http';
import { rateLimit } from '$lib/server/rate-limit';
import { addComment, toCommentDto } from '$lib/server/services/comments';
import { commentCreateSchema } from '$lib/server/validation';
import { loadWidgetThread } from '$lib/server/widget-thread';

export const POST = api(async (event) => {
	const { project } = event.locals.widget!;
	const admin = event.locals.user;
	const thread = await loadWidgetThread(event);

	if (!admin) {
		if (!project.reviewerRepliesEnabled) {
			throw new ApiError(403, 'Replies from reviewers are disabled on this project', 'forbidden');
		}
		const limit = rateLimit(`comment:${project.id}:${clientAddress(event)}`, 60, 10 * 60 * 1000);
		if (!limit.ok) {
			throw new ApiError(429, 'Too many replies, please try again later', 'rate_limited', {
				retryAfter: limit.retryAfter
			});
		}
	}

	const input = await readJson(event.request, commentCreateSchema, 50_000);
	const comment = await addComment({
		feedbackId: thread.item.id,
		body: input.body,
		authorName: admin ? admin.name : (input.author?.name ?? null),
		authorEmail: admin ? admin.email : (input.author?.email ?? null),
		userId: admin?.id ?? null
	});
	return json(toCommentDto(comment), { status: 201 });
});
