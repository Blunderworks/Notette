import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { setSessionCookie } from '$lib/server/auth/cookies';
import { createSession } from '$lib/server/auth/sessions';
import { clientAddress } from '$lib/server/http';
import { countUsers, createUser } from '$lib/server/services/users';
import { emailSchema, passwordSchema } from '$lib/server/validation';

export const load: PageServerLoad = async () => {
	if ((await countUsers()) > 0) redirect(303, '/login');
	return {};
};

export const actions: Actions = {
	default: async (event) => {
		if ((await countUsers()) > 0) redirect(303, '/login');

		const form = await event.request.formData();
		const name = String(form.get('name') ?? '').trim();
		const emailRaw = String(form.get('email') ?? '');
		const password = String(form.get('password') ?? '');
		const confirm = String(form.get('confirm') ?? '');
		const values = { name, email: emailRaw.trim().toLowerCase() };

		const email = emailSchema.safeParse(emailRaw);
		if (!email.success) return fail(400, { ...values, error: 'Enter a valid email address.' });
		if (!name) return fail(400, { ...values, error: 'Name is required.' });
		const pw = passwordSchema.safeParse(password);
		if (!pw.success) return fail(400, { ...values, error: pw.error.issues[0]?.message ?? 'Invalid password.' });
		if (password !== confirm) return fail(400, { ...values, error: 'Passwords do not match.' });

		const user = await createUser({ email: email.data, name, password, role: 'owner' });
		const { token, session } = await createSession({
			userId: user.id,
			kind: 'dashboard',
			userAgent: event.request.headers.get('user-agent'),
			ipAddress: clientAddress(event)
		});
		setSessionCookie(event, token, session.expiresAt);
		redirect(303, '/');
	}
};
