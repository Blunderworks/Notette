import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { clientAddress } from '$lib/server/http';
import { isUuid } from '$lib/server/ids';
import {
	approveAuthRequest,
	denyAuthRequest,
	getAuthRequestWithProject,
	isAuthRequestExpired
} from '$lib/server/services/auth-requests';

type State = 'missing' | 'expired' | 'pending' | 'approved' | 'denied';

async function describe(requestId: string | null) {
	if (!requestId || !isUuid(requestId)) return { state: 'missing' as State, project: null, origin: null };
	const row = await getAuthRequestWithProject(requestId);
	if (!row) return { state: 'missing' as State, project: null, origin: null };
	let state: State = row.request.status;
	if (state === 'pending' && isAuthRequestExpired(row.request)) state = 'expired';
	return { state, project: { id: row.project.id, name: row.project.name }, origin: row.request.origin, row };
}

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		redirect(303, `/login?redirect=${encodeURIComponent(url.pathname + url.search)}`);
	}
	const requestId = url.searchParams.get('request');
	const info = await describe(requestId);
	return {
		requestId,
		state: info.state,
		project: info.project,
		origin: info.origin,
		user: { name: locals.user.name, email: locals.user.email }
	};
};

export const actions: Actions = {
	approve: async (event) => {
		if (!event.locals.user) return fail(401, { error: 'Sign in first.' });
		const form = await event.request.formData();
		const info = await describe(String(form.get('request') ?? ''));
		if (info.state !== 'pending' || !info.row) return fail(400, { error: 'This request can no longer be approved.' });
		await approveAuthRequest(info.row.request, event.locals.user, {
			userAgent: event.request.headers.get('user-agent'),
			ipAddress: clientAddress(event)
		});
		return { approved: true };
	},
	deny: async (event) => {
		if (!event.locals.user) return fail(401, { error: 'Sign in first.' });
		const form = await event.request.formData();
		const info = await describe(String(form.get('request') ?? ''));
		if (info.row && info.state === 'pending') await denyAuthRequest(info.row.request);
		return { denied: true };
	}
};
