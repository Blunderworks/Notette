import type { RequestEvent } from '@sveltejs/kit';
import { adminUser, ApiError } from '$lib/server/http';
import { isUuid } from '$lib/server/ids';
import { getFeedbackThread, type FeedbackThread } from '$lib/server/services/feedback';
import { requireWidgetViewer } from '$lib/server/widget-access';

/**
 * Loads a feedback thread for a widget API request and enforces project scope,
 * the sign-in requirement and reviewer visibility rules. Members count as
 * reviewers here: only owners/admins bypass `publicFeedbackVisible`.
 */
export async function loadWidgetThread(event: RequestEvent): Promise<FeedbackThread> {
	const { project } = event.locals.widget!;
	requireWidgetViewer(event);
	const id = event.params.id ?? '';
	if (!isUuid(id)) throw new ApiError(404, 'Feedback not found', 'not_found');
	const thread = await getFeedbackThread(id);
	if (!thread || thread.item.projectId !== project.id) {
		throw new ApiError(404, 'Feedback not found', 'not_found');
	}
	if (!adminUser(event) && !project.publicFeedbackVisible) {
		throw new ApiError(403, 'Feedback is not visible to reviewers on this project', 'forbidden');
	}
	return thread;
}
