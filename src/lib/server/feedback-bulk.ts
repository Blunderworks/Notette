import { fail, type RequestEvent } from '@sveltejs/kit';
import { isUuid } from '$lib/server/ids';
import { deleteFeedbackMany, setFeedbackStatusMany } from '$lib/server/services/feedback';

export type BulkFeedbackOp = 'resolve' | 'reopen' | 'delete';

export interface BulkFeedbackResult {
	action: 'bulk';
	op: BulkFeedbackOp;
	success: true;
	count: number;
}

/**
 * Shared form action for the feedback lists: applies `op` (`resolve`, `reopen`
 * or `delete`) to the feedback ids in the `ids` field (comma separated). Used
 * both by the bulk toolbar and by the per-row buttons, which submit a single id.
 * When `projectId` is given, ids outside that project are ignored.
 */
export async function bulkFeedbackAction(event: RequestEvent, opts: { projectId?: string } = {}) {
	const form = await event.request.formData();
	const op = String(form.get('op') ?? '');
	if (op !== 'resolve' && op !== 'reopen' && op !== 'delete') {
		return fail(400, { action: 'bulk' as const, error: 'Unknown action.' });
	}
	const ids = Array.from(
		new Set(
			String(form.get('ids') ?? '')
				.split(',')
				.map((id) => id.trim())
				.filter(isUuid)
		)
	).slice(0, 500);
	if (ids.length === 0) return fail(400, { action: 'bulk' as const, error: 'Nothing selected.' });

	const count =
		op === 'delete'
			? await deleteFeedbackMany(ids, opts.projectId)
			: await setFeedbackStatusMany(ids, op === 'resolve' ? 'resolved' : 'open', event.locals.user!, opts.projectId);
	const result: BulkFeedbackResult = { action: 'bulk', op, success: true, count };
	return result;
}
