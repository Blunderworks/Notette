import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { parseProjectForm } from '$lib/server/project-form';
import { createProject } from '$lib/server/services/projects';

export const actions: Actions = {
	default: async ({ request }) => {
		const { values, errors } = parseProjectForm(await request.formData());
		if (errors.length) return fail(400, { values, errors });
		const { originsText: _ignored, ...input } = values;
		const project = await createProject(input);
		redirect(303, `/projects/${project.id}/settings?created=1`);
	}
};
