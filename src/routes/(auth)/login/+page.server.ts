import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { setSessionCookie } from '$lib/server/auth/cookies';
import { verifyPassword } from '$lib/server/auth/password';
import { createSession } from '$lib/server/auth/sessions';
import { ApiError, clientAddress } from '$lib/server/http';
import { rateLimit } from '$lib/server/rate-limit';
import { safeRedirectTarget } from '$lib/server/redirect';
import { countUsers, getUserByEmail } from '$lib/server/services/users';
import { requireTurnstile, TURNSTILE_FORM_FIELD, turnstileSiteKey } from '$lib/server/turnstile';

export const load: PageServerLoad = async ({ locals, url }) => {
	const redirectTo = safeRedirectTarget(url.searchParams.get('redirect'));
	if (locals.user) redirect(303, redirectTo);
	if ((await countUsers()) === 0) redirect(303, '/setup');
	return { redirectTo, turnstileSiteKey: turnstileSiteKey() };
};

export const actions: Actions = {
	default: async (event) => {
		const form = await event.request.formData();
		const email = String(form.get('email') ?? '')
			.trim()
			.toLowerCase();
		const password = String(form.get('password') ?? '');
		const redirectTo = safeRedirectTarget(String(form.get('redirect') ?? ''));

		const limit = rateLimit(`login:${clientAddress(event)}`, 10, 15 * 60 * 1000);
		if (!limit.ok) {
			return fail(429, { email, error: `Too many attempts. Try again in ${Math.ceil(limit.retryAfter / 60)} minutes.` });
		}
		if (!email || !password) {
			return fail(400, { email, error: 'Email and password are required.' });
		}
		try {
			await requireTurnstile(event, String(form.get(TURNSTILE_FORM_FIELD) ?? ''));
		} catch (err) {
			if (err instanceof ApiError) return fail(err.status, { email, error: err.message });
			throw err;
		}

		const user = await getUserByEmail(email);
		const valid = user ? await verifyPassword(password, user.passwordHash) : false;
		if (!user || !valid) {
			return fail(400, { email, error: 'Incorrect email or password.' });
		}

		const { token, session } = await createSession({
			userId: user.id,
			kind: 'dashboard',
			userAgent: event.request.headers.get('user-agent'),
			ipAddress: clientAddress(event)
		});
		setSessionCookie(event, token, session.expiresAt);
		redirect(303, redirectTo);
	}
};
