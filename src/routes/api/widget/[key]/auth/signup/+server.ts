import { json } from '@sveltejs/kit';
import { createSession } from '$lib/server/auth/sessions';
import { ApiError, api, clientAddress, readJson } from '$lib/server/http';
import { rateLimit } from '$lib/server/rate-limit';
import { addProjectMember } from '$lib/server/services/members';
import { createUser, toViewerDto } from '$lib/server/services/users';
import { requireTurnstile } from '$lib/server/turnstile';
import { widgetSignupSchema } from '$lib/server/validation';
import type { WidgetAuthResultDto } from '$lib/shared/types';

/**
 * Inline widget sign-up, available only on projects that are open for
 * signups. Creates a member account, adds it to the project and signs it in.
 */
export const POST = api(async (event) => {
	const { project, origin } = event.locals.widget!;
	if (!project.openSignups) {
		throw new ApiError(403, 'Sign-ups are not open for this project', 'signups_closed');
	}
	const limit = rateLimit(`widget-signup:${clientAddress(event)}`, 5, 60 * 60 * 1000);
	if (!limit.ok) {
		throw new ApiError(429, 'Too many sign-up attempts, please try again later', 'rate_limited', {
			retryAfter: limit.retryAfter
		});
	}
	const input = await readJson(event.request, widgetSignupSchema);
	await requireTurnstile(event, input.turnstileToken);

	let user;
	try {
		user = await createUser({ email: input.email, name: input.name, password: input.password, role: 'member' });
	} catch (err) {
		if (err instanceof ApiError && err.code === 'user_exists') {
			throw new ApiError(409, 'An account with this email already exists. Sign in instead.', 'user_exists');
		}
		throw err;
	}
	await addProjectMember(project.id, user.id, null);

	const { token } = await createSession({
		userId: user.id,
		kind: 'widget',
		projectId: project.id,
		origin,
		userAgent: event.request.headers.get('user-agent'),
		ipAddress: clientAddress(event)
	});
	return json({ token, viewer: toViewerDto(user) } satisfies WidgetAuthResultDto, {
		status: 201,
		headers: { 'Cache-Control': 'no-store' }
	});
});
