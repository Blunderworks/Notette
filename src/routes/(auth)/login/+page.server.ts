import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { setSessionCookie } from '$lib/server/auth/cookies';
import { verifyUserPassword } from '$lib/server/auth/password';
import { createSession } from '$lib/server/auth/sessions';
import { config } from '$lib/server/env';
import { ACCOUNT_LOGIN_LIMIT, clientAddress, clientNetwork } from '$lib/server/http';
import { rateLimit } from '$lib/server/rate-limit';
import { safeRedirectTarget } from '$lib/server/redirect';
import { resendVerificationEmail } from '$lib/server/services/email-verification';
import { countUsers, getUserByEmail } from '$lib/server/services/users';

export const load: PageServerLoad = async ({ locals, url }) => {
	const redirectTo = safeRedirectTarget(url.searchParams.get('redirect'));
	if (locals.user) redirect(303, redirectTo);
	if ((await countUsers()) === 0) redirect(303, '/setup');
	return { redirectTo };
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

		const limit = rateLimit(`login:${clientNetwork(event)}`, 10, 15 * 60 * 1000);
		if (!limit.ok) {
			return loginFailure(429, { email, error: `Too many attempts. Try again in ${Math.ceil(limit.retryAfter / 60)} minutes.` });
		}
		if (!email || !password) {
			return loginFailure(400, { email, error: 'Email and password are required.' });
		}

		if (!rateLimit(`login-account:${email}`, ACCOUNT_LOGIN_LIMIT.max, ACCOUNT_LOGIN_LIMIT.windowMs).ok) {
			return loginFailure(429, { email, error: 'Too many attempts for this account. Try again later.' });
		}
		const user = await getUserByEmail(email);
		const valid = await verifyUserPassword(password, user?.passwordHash);
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
		const limit = rateLimit(`verify-resend:${clientNetwork(event)}`, 5, 15 * 60 * 1000);
		// Per-address cap so the form cannot be used to flood someone's inbox from many networks.
		const perAddress = rateLimit(`verify-resend-email:${email}`, 3, 60 * 60 * 1000);
		if (!limit.ok || !perAddress.ok) return fail(429, { email, error: 'Too many requests. Try again later.' });
		if (config.verificationEmailEnabled && email) {
			try {
				await resendVerificationEmail(email);
			} catch (err) {
				console.error('[notette] Could not resend verification email', err);
				return fail(503, { email, error: 'Could not send the email right now. Try again later.' });
			}
		}
		return { email, resent: true };
	}
};
