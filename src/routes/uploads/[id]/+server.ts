import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isUuid } from '$lib/server/ids';
import { getProject } from '$lib/server/services/projects';
import { getUpload } from '$lib/server/services/uploads';
import { getStorage } from '$lib/server/storage';

/**
 * Serves stored screenshots. Admins (dashboard session) can always access
 * them; otherwise access is granted only when the project exposes feedback to
 * reviewers. Upload ids are random UUIDs and not enumerable.
 */
export const GET: RequestHandler = async (event) => {
	const id = event.params.id;
	if (!isUuid(id)) error(404, 'Not found');
	const upload = await getUpload(id);
	if (!upload) error(404, 'Not found');

	if (!event.locals.user) {
		const project = await getProject(upload.projectId);
		if (!project || !project.publicFeedbackVisible) error(404, 'Not found');
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
