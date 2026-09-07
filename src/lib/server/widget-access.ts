import type { RequestEvent } from '@sveltejs/kit';
import type { User } from '$lib/server/db/schema';
import { ApiError } from '$lib/server/http';

/**
 * Enforces the project's "allow anonymous feedback" setting on widget API
 * routes. Returns the signed-in user (any role) or null for anonymous
 * reviewers on projects that allow them. The config and auth routes must not
 * call this: the widget needs them to discover that it has to sign in.
 */
export function requireWidgetViewer(event: RequestEvent): User | null {
	const { project } = event.locals.widget!;
	if (!project.anonymousFeedbackAllowed && !event.locals.user) {
		throw new ApiError(401, 'Sign in to use feedback on this site', 'sign_in_required');
	}
	return event.locals.user;
}
