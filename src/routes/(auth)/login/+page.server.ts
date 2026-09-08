import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { setSessionCookie } from '$lib/server/auth/cookies';
import { verifyPassword } from '$lib/server/auth/password';
import { createSession } from '$lib/server/auth/sessions';
import { baseUrl } from '$lib/server/base-url';
import { config } from '$lib/server/env';
import { ApiError, clientAddress } from '$lib/server/http';
import { rateLimit } from '$lib/server/rate-limit';
import { safeRedirectTarget } from '$lib/server/redirect';
import { resendVerificationEmail } from '$lib/server/services/email-verification';
import { countUsers, getUserByEmail } from '$lib/server/services/users';
import { requireTurnstile, TURNSTILE_FORM_FIELD, turnstileSiteKey } from '$lib/server/turnstile';

export const load: PageServerLoad = async ({ locals, url }) => {
	const redirectTo = safeRedirectTarget(url.searchParams.get('redirect'));
	if (locals.user) redirect(303, redirectTo);
	if ((await countUsers()) === 0) redirect(303, '/setup');
	return { redirectTo, turnstileSiteKey: turnstileSiteKey() };
};

/** Shape of every failed login attempt, spelled out so TypeScript keeps `unverified` in the form data type. */
interface LoginFailure {
	email: string;
	error: string;
	unverified?: boolean;
}

const loginFailure = (status: number, data: LoginFailure) => fail(status, data);

export const actions: Actions = {
	login: async (event) => {
		const form = await event.request.formData();
		const email = String(form.get('email') ?? '')
			.trim()
			.toLowerCase();
		const password = String(form.get('password') ?? '');
		const redirectTo = safeRedirectTarget(String(form.get('redirect') ?? ''));

		const limit = rateLimit(`login:${clientAddress(event)}`, 10, 15 * 60 * 1000);
		if (!limit.ok) {
			return loginFailure(429, { email, error: `Too many attempts. Try again in ${Math.ceil(limit.retryAfter / 60)} minutes.` });
		}
		if (!email || !password) {
			return loginFailure(400, { email, error: 'Email and password are required.' });
		}
		try {
			await requireTurnstile(event, String(form.get(TURNSTILE_FORM_FIELD) ?? ''));
		} catch (err) {
			if (err instanceof ApiError) return loginFailure(err.status, { email, error: err.message });
			throw err;
		}

		const user = await getUserByEmail(email);
		const valid = user ? await verifyPassword(password, user.passwordHash) : false;
		if (!user || !valid) {
			return loginFailure(400, { email, error: 'Incorrect email or password.' });
		}
		if (!user.emailVerifiedAt) {
			return loginFailure(403, {
				email,
				error: 'Confirm your email address first. Check your inbox for the link we sent.',
				unverified: true
			});
		}

		const { token, session } = await createSession({
			userId: user.id,
			kind: 'dashboard',
			userAgent: event.request.headers.get('user-agent'),
			ipAddress: clientAddress(event)
		});
		setSessionCookie(event, token, session.expiresAt);
		redirect(303, redirectTo);
	},
	/** Sends a fresh confirmation link to an unverified account (silently ignores other addresses). */
	resend: async (event) => {
		const form = await event.request.formData();
		const email = String(form.get('email') ?? '')
			.trim()
			.toLowerCase();
		const limit = rateLimit(`verify-resend:${clientAddress(event)}`, 5, 15 * 60 * 1000);
		if (!limit.ok) return fail(429, { email, error: 'Too many requests. Try again later.' });
		if (config.emailEnabled && email) {
			try {
				await resendVerificationEmail(email, baseUrl(event));
			} catch (err) {
				console.error('[notette] Could not resend verification email', err);
				return fail(503, { email, error: 'Could not send the email right now. Try again later.' });
			}
		}
		return { email, resent: true };
	}
};
