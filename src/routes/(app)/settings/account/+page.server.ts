import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { verifyPassword } from '$lib/server/auth/password';
import { deleteUserSession, invalidateUserSessions, listUserSessions } from '$lib/server/auth/sessions';
import { setUserPassword, updateUserProfile } from '$lib/server/services/users';
import { passwordSchema } from '$lib/server/validation';
import { config } from '$lib/server/env';
import { describeEmailTransport, sendTestEmail } from '$lib/server/email/mailer';
import { renderTestEmail } from '$lib/server/email/templates';
import { rateLimit } from '$lib/server/rate-limit';
import { isAdminRole } from '$lib/shared/roles';

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!;
	const sessions = await listUserSessions(user.id);
	const isAdmin = isAdminRole(user.role);
	return {
		/** Outgoing email summary for the admin-only *Email* card. */
		email: isAdmin
			? {
					enabled: config.emailEnabled,
					transport: config.emailEnabled ? describeEmailTransport() : null,
					from: config.emailFrom,
					missing: [!config.smtpHost && 'SMTP_HOST', !config.emailFrom && 'EMAIL_FROM'].filter((v): v is string => !!v)
				}
			: null,
		sessions: sessions.map((s) => ({
			id: s.id,
			kind: s.kind,
			origin: s.origin,
			userAgent: s.userAgent,
			createdAt: s.createdAt.toISOString(),
			lastUsedAt: s.lastUsedAt.toISOString(),
			expiresAt: s.expiresAt.toISOString(),
			current: s.id === locals.session?.id
		}))
	};
};

export const actions: Actions = {
	profile: async ({ request, locals }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		if (!name || name.length > 120) return fail(400, { action: 'profile', error: 'Enter a name (max 120 characters).' });
		await updateUserProfile(locals.user!.id, { name });
		return { action: 'profile', success: true };
	},
	password: async ({ request, locals }) => {
		const form = await request.formData();
		const current = String(form.get('current') ?? '');
		const next = String(form.get('password') ?? '');
		const confirm = String(form.get('confirm') ?? '');
		const user = locals.user!;
		if (!(await verifyPassword(current, user.passwordHash))) {
			return fail(400, { action: 'password', error: 'Current password is incorrect.' });
		}
		const parsed = passwordSchema.safeParse(next);
		if (!parsed.success) return fail(400, { action: 'password', error: parsed.error.issues[0]?.message ?? 'Invalid password.' });
		if (next !== confirm) return fail(400, { action: 'password', error: 'Passwords do not match.' });
		await setUserPassword(user.id, next);
		await invalidateUserSessions(user.id, locals.session?.id);
		return { action: 'password', success: true };
	},
	revokeSession: async ({ request, locals }) => {
		const form = await request.formData();
		const id = String(form.get('sessionId') ?? '');
		if (id === locals.session?.id) return fail(400, { action: 'revokeSession', error: 'Use sign out to end the current session.' });
		await deleteUserSession(locals.user!.id, id);
		return { action: 'revokeSession', success: true };
	},
	testEmail: async ({ locals }) => {
		const user = locals.user!;
		if (!isAdminRole(user.role)) return fail(403, { action: 'testEmail', error: 'Only admins can send test emails.' });
		if (!config.emailEnabled) {
			return fail(400, { action: 'testEmail', error: 'Email is not configured: set SMTP_HOST and EMAIL_FROM and restart Notette.' });
		}
		const limit = rateLimit(`test-email:${user.id}`, 5, 10 * 60 * 1000);
		if (!limit.ok) {
			return fail(429, { action: 'testEmail', error: `Too many test emails; try again in ${limit.retryAfter}s.` });
		}
		const mail = renderTestEmail({
			name: user.name,
			requestedBy: user.email,
			transport: describeEmailTransport(),
			from: config.emailFrom!,
			sentAt: new Date()
		});
		const started = Date.now();
		const result = await sendTestEmail({ to: user.email, ...mail });
		const ms = Date.now() - started;
		if (!result.ok) {
			console.warn(`[notette] Test email to ${user.email} failed after ${ms}ms: ${result.error}`);
			return fail(502, { action: 'testEmail', error: result.error, to: user.email, ms });
		}
		console.log(`[notette] Test email accepted for ${user.email} in ${ms}ms: ${result.response ?? ''}`.trim());
		return { action: 'testEmail', success: true, to: user.email, response: result.response ?? null, ms };
	},
	revokeOthers: async ({ locals }) => {
		await invalidateUserSessions(locals.user!.id, locals.session?.id);
		return { action: 'revokeOthers', success: true };
	}
};
