import { json, text, type Handle, type HandleServerError, type RequestEvent, type ServerInit } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { config } from '$lib/server/env';
import { runMigrations } from '$lib/server/db/migrate';
import { ensureBootstrapAdmin } from '$lib/server/auth/bootstrap';
import { clearSessionCookie, setSessionCookie } from '$lib/server/auth/cookies';
import { deleteExpiredSessions, invalidateSession, SESSION_COOKIE, validateSession } from '$lib/server/auth/sessions';
import { dashboardAccess } from '$lib/server/dashboard-access';
import { isIdentityToken, verifyIdentityToken } from '$lib/server/identity';
import { getRequestOrigin, isOriginAllowed } from '$lib/server/origins';
import { ensureProjectAccess } from '$lib/server/services/members';
import { getProjectByClientKey } from '$lib/server/services/projects';
import { deleteExpiredAuthRequests } from '$lib/server/services/auth-requests';
import { deleteExpiredVerifications } from '$lib/server/services/email-verification';
import { cleanupNotifications, startNotificationScheduler } from '$lib/server/services/notifications';
import { checkEmailTransport } from '$lib/server/email/mailer';
import { errorResponse } from '$lib/server/http';
import { applyCors, corsHeaders, WIDGET_API_PREFIX } from '$lib/server/widget-cors';

export const init: ServerInit = async () => {
	if (config.autoMigrate) {
		await runMigrations();
		console.log('[notette] Database migrations applied');
	}
	await ensureBootstrapAdmin();

	if (config.emailEnabled) {
		// Do not block startup on the SMTP handshake; a failure is only logged and sends are retried.
		void checkEmailTransport().then((result) => {
			if (result.ok) {
				console.log(
					`[notette] Email enabled via ${config.smtpHost}:${config.smtpPort}; notification digests go out ${config.emailBatchSeconds}s after the first update`
				);
			} else {
				console.warn(`[notette] Email is configured but the SMTP connection check failed: ${result.error}`);
			}
		});
		startNotificationScheduler();
	}

	const maintenance = async () => {
		try {
			await deleteExpiredSessions();
			await deleteExpiredAuthRequests();
			await deleteExpiredVerifications();
			await cleanupNotifications();
		} catch (err) {
			console.warn('[notette] Maintenance task failed', err);
		}
	};
	void maintenance();
	setInterval(maintenance, 60 * 60 * 1000).unref();
};

/**
 * Widget API: validates the project key and the requesting origin, answers
 * CORS preflights, and authenticates via bearer credentials only: a widget
 * session (admins and members) or a host-signed identity token. Cookies are
 * deliberately ignored on these routes.
 */
const widgetApi: Handle = async ({ event, resolve }) => {
	event.locals.user = null;
	event.locals.session = null;
	event.locals.identity = null;
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
	const bearer = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
	if (bearer && isIdentityToken(bearer)) {
		// Unlike stale sessions, a rejected identity token must not silently
		// downgrade to anonymous feedback: the caller refreshes the token instead.
		const result = await verifyIdentityToken(project, bearer);
		if (!result.ok) return applyCors(errorResponse(result.status, result.message, result.code), origin);
		event.locals.identity = result.identity;
	} else if (bearer) {
		const result = await validateSession(bearer);
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

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Refusal for a dashboard mutation the caller may not perform. Enhanced forms
 * (`use:enhance`) get an ActionResult as SvelteKit would send; plain form
 * posts get an HTTP redirect or status.
 */
function deniedMutation(event: RequestEvent, access: 'sign_in' | 'forbidden'): Response {
	const enhanced = event.request.headers.get('x-sveltekit-action') === 'true';
	if (access === 'sign_in') {
		const location = `/login?redirect=${encodeURIComponent(event.url.pathname)}`;
		return enhanced
			? json({ type: 'redirect', status: 303, location })
			: new Response(null, { status: 303, headers: { location } });
	}
	const message = 'This action requires an admin account';
	return enhanced ? json({ type: 'error', error: { message } }, { status: 403 }) : text(message, { status: 403 });
}

/** Dashboard: cookie sessions, the `(app)` access rule for mutations, and baseline security headers. */
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

	// Form actions run without layout loads, so the (app) layout's sign-in and
	// role gate would not apply to them; enforce the same rule for every mutation.
	const access = READ_METHODS.has(event.request.method) ? 'allowed' : dashboardAccess(event.route.id, event.locals.user);
	const response = access === 'allowed' ? await resolve(event) : deniedMutation(event, access);
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
