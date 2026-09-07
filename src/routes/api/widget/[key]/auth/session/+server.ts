import { json } from '@sveltejs/kit';
import { api } from '$lib/server/http';
import { invalidateSession } from '$lib/server/auth/sessions';

/** Signs the widget admin out by revoking the bearer session. */
export const DELETE = api(async (event) => {
	if (event.locals.session) await invalidateSession(event.locals.session.id);
	return json({ ok: true });
});
