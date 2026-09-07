import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { verifyPassword } from '$lib/server/auth/password';
import { deleteUserSession, invalidateUserSessions, listUserSessions } from '$lib/server/auth/sessions';
import { setUserPassword, updateUserProfile } from '$lib/server/services/users';
import { passwordSchema } from '$lib/server/validation';

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!;
	const sessions = await listUserSessions(user.id);
	return {
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
	revokeOthers: async ({ locals }) => {
		await invalidateUserSessions(locals.user!.id, locals.session?.id);
		return { action: 'revokeOthers', success: true };
	}
};
