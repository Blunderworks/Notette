import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { isOriginAllowed } from '$lib/server/origins';
import { getProject, updateProject } from '$lib/server/services/projects';

export const load: PageServerLoad = async ({ url, parent }) => {
	const { project } = await parent();
	const origin = url.origin;
	return {
		origin,
		selfAllowed: isOriginAllowed(origin, project.allowedOrigins)
	};
};

export const actions: Actions = {
	allowSelf: async ({ params, url }) => {
		const project = await getProject(params.id);
		if (!project) return fail(404, { error: 'Project not found.' });
		const origin = url.origin.toLowerCase();
		if (!project.allowedOrigins.includes(origin)) {
			await updateProject(project.id, { allowedOrigins: [...project.allowedOrigins, origin] });
		}
		return { success: true };
	}
};
