import type { RequestEvent } from '@sveltejs/kit';
import type { User } from '$lib/server/db/schema';
import { ApiError, clientNetwork } from '$lib/server/http';

/**
 * Enforces the project's "allow anonymous feedback" setting on widget API
 * routes. A verified host app identity counts as signed in. Returns the
 * signed-in Notette user (any role) or null for identified app users and
 * anonymous reviewers. The config and auth routes must not call this: the
 * widget needs them to discover that it has to sign in.
 */
export function requireWidgetViewer(event: RequestEvent): User | null {
	const { project } = event.locals.widget!;
	if (!project.anonymousFeedbackAllowed && !event.locals.user && !event.locals.identity) {
		throw new ApiError(401, 'Sign in to use feedback on this site', 'sign_in_required');
	}
	return event.locals.user;
}

/** Rate-limit key for reviewer writes: the account, the app user, or the client network. */
export function widgetWriterKey(event: RequestEvent): string {
	const { user, identity } = event.locals;
	if (user) return user.id;
	if (identity) return `app:${identity.id}`;
	return clientNetwork(event);
}
