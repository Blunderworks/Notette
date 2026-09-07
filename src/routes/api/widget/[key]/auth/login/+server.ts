import { json } from '@sveltejs/kit';
import { verifyPassword } from '$lib/server/auth/password';
import { createSession } from '$lib/server/auth/sessions';
import { ApiError, api, clientAddress, readJson } from '$lib/server/http';
import { rateLimit } from '$lib/server/rate-limit';
import { ensureProjectAccess } from '$lib/server/services/members';
import { getUserByEmail, toViewerDto } from '$lib/server/services/users';
import { requireTurnstile } from '$lib/server/turnstile';
import { widgetLoginSchema } from '$lib/server/validation';
import type { WidgetAuthResultDto } from '$lib/shared/types';

/**
 * Inline widget sign-in: exchanges email + password for a widget bearer token
 * bound to this project and origin. Any role may sign in; members must have
 * access to the project (added in the dashboard, or the project is open).
 */
export const POST = api(async (event) => {
	const { project, origin } = event.locals.widget!;
	const limit = rateLimit(`widget-login:${clientAddress(event)}`, 10, 15 * 60 * 1000);
	if (!limit.ok) {
		throw new ApiError(429, 'Too many sign-in attempts, please try again later', 'rate_limited', {
			retryAfter: limit.retryAfter
		});
	}
	const input = await readJson(event.request, widgetLoginSchema);
	await requireTurnstile(event, input.turnstileToken);

	const user = await getUserByEmail(input.email);
	const valid = user ? await verifyPassword(input.password, user.passwordHash) : false;
	if (!user || !valid) throw new ApiError(400, 'Incorrect email or password', 'invalid_credentials');
	if (!(await ensureProjectAccess(user, project))) {
		throw new ApiError(403, 'Your account does not have access to this project', 'project_access_denied');
	}

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
