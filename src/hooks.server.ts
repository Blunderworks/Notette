import type { Handle, HandleServerError, ServerInit } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { config } from '$lib/server/env';
import { runMigrations } from '$lib/server/db/migrate';
import { ensureBootstrapAdmin } from '$lib/server/auth/bootstrap';
import { clearSessionCookie, setSessionCookie } from '$lib/server/auth/cookies';
import { deleteExpiredSessions, invalidateSession, SESSION_COOKIE, validateSession } from '$lib/server/auth/sessions';
import { getRequestOrigin, isOriginAllowed } from '$lib/server/origins';
import { ensureProjectAccess } from '$lib/server/services/members';
import { getProjectByClientKey } from '$lib/server/services/projects';
import { deleteExpiredAuthRequests } from '$lib/server/services/auth-requests';
import { errorResponse } from '$lib/server/http';
import { applyCors, corsHeaders, WIDGET_API_PREFIX } from '$lib/server/widget-cors';

export const init: ServerInit = async () => {
	if (config.autoMigrate) {
		await runMigrations();
		console.log('[notette] Database migrations applied');
	}
	await ensureBootstrapAdmin();

	const maintenance = async () => {
		try {
			await deleteExpiredSessions();
			await deleteExpiredAuthRequests();
		} catch (err) {
			console.warn('[notette] Maintenance task failed', err);
		}
	};
	void maintenance();
	setInterval(maintenance, 60 * 60 * 1000).unref();
};

/**
 * Widget API: validates the project key and the requesting origin, answers
 * CORS preflights, and authenticates users (admins and members) via bearer
 * tokens only. Cookies are deliberately ignored on these routes.
 */
const widgetApi: Handle = async ({ event, resolve }) => {
	event.locals.user = null;
	event.locals.session = null;
	event.locals.widget = null;

	const { pathname } = event.url;
	if (!pathname.startsWith(WIDGET_API_PREFIX)) return resolve(event);

	const key = pathname.slice(WIDGET_API_PREFIX.length).split('/')[0] ?? '';
	const origin = getRequestOrigin(event.request);
	const project = key ? await getProjectByClientKey(key) : null;
	const allowed = !!(project && origin && isOriginAllowed(origin, project.allowedOrigins));

	if (event.request.method === 'OPTIONS') {
		if (!allowed || !origin) return new Response(null, { status: 403 });
		return new Response(null, { status: 204, headers: corsHeaders(origin, true) });
	}

	// Error responses carry CORS headers so the widget can surface a useful
	// configuration message; they contain no project data.
	if (!project) {
		const res = errorResponse(404, 'Unknown project key', 'unknown_project');
		return origin ? applyCors(res, origin) : res;
	}
	if (!origin) {
		return errorResponse(403, 'Missing Origin header', 'origin_required');
	}
	if (!allowed) {
		return applyCors(
			errorResponse(403, `Origin ${origin} is not allowed for this project`, 'origin_not_allowed'),
			origin
		);
	}

	event.locals.widget = { project, origin };

	const authorization = event.request.headers.get('authorization');
	if (authorization?.startsWith('Bearer ')) {
		const result = await validateSession(authorization.slice(7).trim());
		if (
			result &&
			result.session.kind === 'widget' &&
			result.session.projectId === project.id &&
			result.session.origin === origin
		) {
			// Members must still belong to the project (or the project must be open,
			// which adds them). Access revoked after sign-in ends the session.
			if (await ensureProjectAccess(result.user, project)) {
				event.locals.user = result.user;
				event.locals.session = result.session;
			} else {
				await invalidateSession(result.session.id);
			}
		}
	}

	const response = await resolve(event);
	return applyCors(response, origin);
};

/** Dashboard: cookie sessions plus baseline security headers. */
const dashboard: Handle = async ({ event, resolve }) => {
	if (event.url.pathname.startsWith(WIDGET_API_PREFIX)) return resolve(event);

	const token = event.cookies.get(SESSION_COOKIE);
	if (token) {
		const result = await validateSession(token);
		if (result && result.session.kind === 'dashboard') {
			event.locals.user = result.user;
			event.locals.session = result.session;
			if (result.renewed) setSessionCookie(event, token, result.session.expiresAt);
		} else {
			clearSessionCookie(event);
		}
	}

	const response = await resolve(event);
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	if (!response.headers.has('X-Frame-Options')) response.headers.set('X-Frame-Options', 'DENY');
	return response;
};

export const handle = sequence(widgetApi, dashboard);

export const handleError: HandleServerError = ({ error, status, message }) => {
	if (status >= 500) console.error('[notette] Unhandled error', error);
	return { message: status === 404 ? 'Not found' : message };
};
