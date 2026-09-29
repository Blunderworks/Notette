import { error, redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { dashboardAccess } from '$lib/server/dashboard-access';
import { listProjects } from '$lib/server/services/projects';
import { isAdminRole } from '$lib/shared/roles';

// Page views only: form actions skip this load and are gated in hooks.server.ts with the same rule.
export const load: LayoutServerLoad = async ({ locals, url, route }) => {
	if (!locals.user) {
		const target = url.pathname + url.search;
		redirect(303, `/login?redirect=${encodeURIComponent(target)}`);
	}
	if (dashboardAccess(route.id, locals.user) === 'forbidden') error(403, 'This page requires an admin account');
	const isAdmin = isAdminRole(locals.user.role);
	if (!isAdmin) return { isAdmin, navProjects: [] };
	const projects = await listProjects();
	return {
		isAdmin,
		navProjects: projects.map((p) => ({ id: p.id, name: p.name, openCount: p.openCount }))
	};
};
