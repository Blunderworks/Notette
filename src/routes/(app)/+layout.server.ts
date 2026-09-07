import { error, redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { listProjects } from '$lib/server/services/projects';
import { isAdminRole } from '$lib/shared/roles';

/** The only dashboard pages a member (non-admin) account may open. */
const MEMBER_PATHS = new Set(['/', '/settings/account']);

export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		const target = url.pathname + url.search;
		redirect(303, `/login?redirect=${encodeURIComponent(target)}`);
	}
	const isAdmin = isAdminRole(locals.user.role);
	if (!isAdmin) {
		const path = url.pathname.replace(/\/+$/, '') || '/';
		if (!MEMBER_PATHS.has(path)) error(403, 'This page requires an admin account');
		return { isAdmin, navProjects: [] };
	}
	const projects = await listProjects();
	return {
		isAdmin,
		navProjects: projects.map((p) => ({ id: p.id, name: p.name, openCount: p.openCount }))
	};
};
