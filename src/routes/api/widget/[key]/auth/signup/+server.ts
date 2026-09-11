import { json } from '@sveltejs/kit';
import { createSession } from '$lib/server/auth/sessions';
import { baseUrl } from '$lib/server/base-url';
import { config } from '$lib/server/env';
import { ApiError, api, clientAddress, readJson } from '$lib/server/http';
import { rateLimit } from '$lib/server/rate-limit';
import { sendVerificationEmail } from '$lib/server/services/email-verification';
import { addProjectMember } from '$lib/server/services/members';
import { createUser } from '$lib/server/services/users';
import { requireTurnstile } from '$lib/server/turnstile';
import { widgetSignupSchema } from '$lib/server/validation';
import { widgetViewer } from '$lib/server/widget-viewer';
import type { WidgetAuthResultDto, WidgetSignupPendingDto } from '$lib/shared/types';

/**
 * Inline widget sign-up, available only on projects that are open for
 * signups. Creates a member account and adds it to the project. When the
 * project requires email verification (and email is configured) the account
 * starts unverified, a confirmation link is sent and no session is issued;
 * otherwise the new account is signed in straight away.
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
	await requireTurnstile(event, project, input.turnstileToken);

	const requireVerification = project.emailVerificationRequired && config.emailEnabled;
	let user;
	try {
		user = await createUser({
			email: input.email,
			name: input.name,
			password: input.password,
			role: 'member',
			verified: !requireVerification
		});
	} catch (err) {
		if (err instanceof ApiError && err.code === 'user_exists') {
			throw new ApiError(409, 'An account with this email already exists. Sign in instead.', 'user_exists');
		}
		throw err;
	}
	await addProjectMember(project.id, user.id, null);

	if (requireVerification) {
		try {
			await sendVerificationEmail(user, origin, baseUrl(event));
		} catch (err) {
			console.error('[notette] Could not send verification email', err);
			throw new ApiError(
				503,
				'Your account was created but the confirmation email could not be sent. Sign in later and choose "Resend".',
				'email_unavailable'
			);
		}
		return json({ verificationRequired: true, email: user.email } satisfies WidgetSignupPendingDto, {
			status: 202,
			headers: { 'Cache-Control': 'no-store' }
		});
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
