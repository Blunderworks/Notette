import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { clearSessionCookie } from '$lib/server/auth/cookies';
import { invalidateSession } from '$lib/server/auth/sessions';

export const load: PageServerLoad = () => {
	redirect(303, '/');
};

export const actions: Actions = {
	default: async (event) => {
		if (event.locals.session) await invalidateSession(event.locals.session.id);
		clearSessionCookie(event);
		redirect(303, '/login');
	}
};
