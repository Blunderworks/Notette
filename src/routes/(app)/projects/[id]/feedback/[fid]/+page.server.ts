import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { baseUrl } from '$lib/server/base-url';
import { isUuid } from '$lib/server/ids';
import { addComment, deleteComment } from '$lib/server/services/comments';
import { deleteFeedback, getFeedbackThread, setFeedbackStatus, toDetailDto } from '$lib/server/services/feedback';

async function loadThread(projectId: string, feedbackId: string) {
	if (!isUuid(feedbackId)) error(404, 'Feedback not found');
	const thread = await getFeedbackThread(feedbackId);
	if (!thread || thread.item.projectId !== projectId) error(404, 'Feedback not found');
	return thread;
}

export const load: PageServerLoad = async (event) => {
	const thread = await loadThread(event.params.id, event.params.fid);
	return {
		item: toDetailDto(thread, baseUrl(event), { includeEmail: true }),
		comments: thread.comments.map((c) => ({
			id: c.id,
			body: c.body,
			authorName: c.authorName,
			authorEmail: c.authorEmail,
			isAdmin: c.userId !== null,
			createdAt: c.createdAt.toISOString()
		}))
	};
};

export const actions: Actions = {
	reply: async ({ request, params, locals }) => {
		const thread = await loadThread(params.id, params.fid);
		const form = await request.formData();
		const body = String(form.get('body') ?? '').trim();
		if (!body) return fail(400, { action: 'reply', error: 'Reply cannot be empty.' });
		if (body.length > 5000) return fail(400, { action: 'reply', error: 'Reply is too long (max 5000 characters).' });
		const user = locals.user!;
		await addComment({
			feedbackId: thread.item.id,
			body,
			authorName: user.name,
			authorEmail: user.email,
			userId: user.id
		});
		return { action: 'reply', success: true };
	},
	setStatus: async ({ request, params, locals }) => {
		const thread = await loadThread(params.id, params.fid);
		const form = await request.formData();
		const status = String(form.get('status') ?? '');
		if (status !== 'open' && status !== 'resolved') return fail(400, { action: 'setStatus', error: 'Invalid status.' });
		await setFeedbackStatus(thread.item.id, status, locals.user!);
		return { action: 'setStatus', success: true };
	},
	deleteComment: async ({ request, params }) => {
		const thread = await loadThread(params.id, params.fid);
		const form = await request.formData();
		const commentId = String(form.get('commentId') ?? '');
		if (!isUuid(commentId) || !thread.comments.some((c) => c.id === commentId)) {
			return fail(404, { action: 'deleteComment', error: 'Comment not found.' });
		}
		await deleteComment(commentId);
		return { action: 'deleteComment', success: true };
	},
	delete: async ({ params }) => {
		const thread = await loadThread(params.id, params.fid);
		await deleteFeedback(thread.item.id);
		redirect(303, `/projects/${params.id}`);
	}
};
