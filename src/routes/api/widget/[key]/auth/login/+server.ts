import { json } from '@sveltejs/kit';
import { verifyUserPassword } from '$lib/server/auth/password';
import { createSession } from '$lib/server/auth/sessions';
import { ACCOUNT_LOGIN_LIMIT, ApiError, api, clientAddress, clientNetwork, readJson } from '$lib/server/http';
import { rateLimit } from '$lib/server/rate-limit';
import { ensureProjectAccess, requiresConfirmedEmail } from '$lib/server/services/members';
import { getUserByEmail } from '$lib/server/services/users';
import { widgetViewer } from '$lib/server/widget-viewer';
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
	const limit = rateLimit(`widget-login:${clientNetwork(event)}`, 10, 15 * 60 * 1000);
	if (!limit.ok) {
		throw new ApiError(429, 'Too many sign-in attempts, please try again later', 'rate_limited', {
			retryAfter: limit.retryAfter
		});
	}
	const input = await readJson(event.request, widgetLoginSchema);
	await requireTurnstile(event, project, input.turnstileToken);

	if (!rateLimit(`login-account:${input.email}`, ACCOUNT_LOGIN_LIMIT.max, ACCOUNT_LOGIN_LIMIT.windowMs).ok) {
		throw new ApiError(429, 'Too many sign-in attempts for this account, please try again later', 'rate_limited');
	}
	const user = await getUserByEmail(input.email);
	const valid = await verifyUserPassword(input.password, user?.passwordHash);
	if (!user || !valid) throw new ApiError(400, 'Incorrect email or password', 'invalid_credentials');
	if (!user.emailVerifiedAt && requiresConfirmedEmail(project)) {
		throw new ApiError(403, 'Confirm your email address first. Check your inbox for the link we sent.', 'email_unverified');
	}
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
	return json({ token, viewer: await widgetViewer(user, project.id) } satisfies WidgetAuthResultDto, {
		status: 201,
		headers: { 'Cache-Control': 'no-store' }
	});
});
