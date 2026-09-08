import { json } from '@sveltejs/kit';
import { adminUser, ApiError, api, clientAddress, readJson } from '$lib/server/http';
import { rateLimit } from '$lib/server/rate-limit';
import { addComment, toCommentDto } from '$lib/server/services/comments';
import { resolveMentions } from '$lib/server/services/mentions';
import { queueCommentNotifications } from '$lib/server/services/notifications';
import { requireTurnstile } from '$lib/server/turnstile';
import { commentCreateSchema } from '$lib/server/validation';
import { loadWidgetThread } from '$lib/server/widget-thread';

export const POST = api(async (event) => {
	const { project } = event.locals.widget!;
	const thread = await loadWidgetThread(event);
	const user = event.locals.user;
	const admin = adminUser(event);

	if (!admin) {
		if (!project.reviewerRepliesEnabled) {
			throw new ApiError(403, 'Replies from reviewers are disabled on this project', 'forbidden');
		}
		const limit = rateLimit(`comment:${project.id}:${user?.id ?? clientAddress(event)}`, 60, 10 * 60 * 1000);
		if (!limit.ok) {
			throw new ApiError(429, 'Too many replies, please try again later', 'rate_limited', {
				retryAfter: limit.retryAfter
			});
		}
	}

	const input = await readJson(event.request, commentCreateSchema, 50_000);
	if (!user) await requireTurnstile(event, input.turnstileToken);

	const mentions = await resolveMentions(user, project.id, input.mentions);
	const comment = await addComment({
		feedbackId: thread.item.id,
		body: input.body,
		authorName: user ? user.name : (input.author?.name ?? null),
		authorEmail: user ? user.email : (input.author?.email ?? null),
		userId: user?.id ?? null,
		authorRole: user?.role ?? null,
		mentions
	});
	await queueCommentNotifications(thread, comment, user);
	return json(toCommentDto(comment), { status: 201 });
});
