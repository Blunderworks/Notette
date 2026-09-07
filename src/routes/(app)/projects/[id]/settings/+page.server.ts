import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { parseProjectForm } from '$lib/server/project-form';
import { deleteProject, getProject, regenerateClientKey, updateProject } from '$lib/server/services/projects';

export const load: PageServerLoad = ({ url }) => {
	return { created: url.searchParams.get('created') === '1' };
};

export const actions: Actions = {
	update: async ({ request, params }) => {
		const { values, errors } = parseProjectForm(await request.formData());
		if (errors.length) return fail(400, { action: 'update', values, errors });
		const { originsText: _ignored, ...input } = values;
		const updated = await updateProject(params.id, input);
		if (!updated) return fail(404, { action: 'update', values, errors: ['Project not found.'] });
		return { action: 'update', success: true };
	},
	regenerateKey: async ({ params }) => {
		const updated = await regenerateClientKey(params.id);
		if (!updated) return fail(404, { action: 'regenerateKey', errors: ['Project not found.'] });
		return { action: 'regenerateKey', success: true };
	},
	delete: async ({ request, params }) => {
		const form = await request.formData();
		const project = await getProject(params.id);
		if (!project) return fail(404, { action: 'delete', errors: ['Project not found.'] });
		if (String(form.get('confirm') ?? '').trim() !== project.name) {
			return fail(400, { action: 'delete', errors: ['Type the project name exactly to confirm deletion.'] });
		}
		await deleteProject(project.id);
		redirect(303, '/');
	}
};
