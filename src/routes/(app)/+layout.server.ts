import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { listProjects } from '$lib/server/services/projects';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		const target = url.pathname + url.search;
		redirect(303, `/login?redirect=${encodeURIComponent(target)}`);
	}
	const projects = await listProjects();
	return {
		navProjects: projects.map((p) => ({ id: p.id, name: p.name, openCount: p.openCount }))
	};
};
