import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isUuid } from '$lib/server/ids';
import { ensureProjectAccess } from '$lib/server/services/members';
import { getProject } from '$lib/server/services/projects';
import { getUpload } from '$lib/server/services/uploads';
import { getStorage } from '$lib/server/storage';
import { isAdminRole } from '$lib/shared/roles';

/**
 * Serves stored screenshots. Admins (dashboard session) can always access
 * them; otherwise access follows the widget rules: the project must expose
 * feedback to reviewers, and when it requires sign-in the viewer must be a
 * signed-in user with access to the project. Upload ids are random UUIDs and
 * not enumerable.
 */
export const GET: RequestHandler = async (event) => {
	const id = event.params.id;
	if (!isUuid(id)) error(404, 'Not found');
	const upload = await getUpload(id);
	if (!upload) error(404, 'Not found');

	const user = event.locals.user;
	if (!user || !isAdminRole(user.role)) {
		const project = await getProject(upload.projectId);
		if (!project || !project.publicFeedbackVisible) error(404, 'Not found');
		if (!project.anonymousFeedbackAllowed && !user) error(404, 'Not found');
		if (user && !(await ensureProjectAccess(user, project))) error(404, 'Not found');
	}

	const object = await getStorage().open(upload.storageKey);
	if (!object) error(404, 'Not found');

	return new Response(object.stream, {
		headers: {
			'Content-Type': upload.mimeType,
			'Content-Length': String(object.size),
			'Cache-Control': 'private, max-age=3600',
			'Cross-Origin-Resource-Policy': 'cross-origin',
			'X-Content-Type-Options': 'nosniff'
		}
	});
};
