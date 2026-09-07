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
import { ensureProjectAccess } from '$lib/server/services/members';
import { isAdminRole } from '$lib/shared/roles';

type State = 'missing' | 'expired' | 'pending' | 'approved' | 'denied' | 'no_access';

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
	let state = info.state;
	// Members need access to the project; open projects add them here.
	if (state === 'pending' && info.row && !(await ensureProjectAccess(locals.user, info.row.project))) {
		state = 'no_access';
	}
	return {
		requestId,
		state,
		project: info.project,
		origin: info.origin,
		user: { name: locals.user.name, email: locals.user.email, admin: isAdminRole(locals.user.role) }
	};
};

export const actions: Actions = {
	approve: async (event) => {
		if (!event.locals.user) return fail(401, { error: 'Sign in first.' });
		const form = await event.request.formData();
		const info = await describe(String(form.get('request') ?? ''));
		if (info.state !== 'pending' || !info.row) return fail(400, { error: 'This request can no longer be approved.' });
		if (!(await ensureProjectAccess(event.locals.user, info.row.project))) {
			return fail(403, { error: 'Your account does not have access to this project.' });
		}
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
