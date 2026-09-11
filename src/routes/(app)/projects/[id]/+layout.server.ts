import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { baseUrl } from '$lib/server/base-url';
import { isUuid } from '$lib/server/ids';
import { getProjectWithCounts } from '$lib/server/services/projects';

export const load: LayoutServerLoad = async (event) => {
	const id = event.params.id;
	if (!isUuid(id)) error(404, 'Project not found');
	const project = await getProjectWithCounts(id);
	if (!project) error(404, 'Project not found');
	return {
		baseUrl: baseUrl(event),
		project: {
			id: project.id,
			turnstileSiteKey: project.turnstileSiteKey,
			turnstileConfigured: !!(project.turnstileSiteKey && project.turnstileSecretKey),
			name: project.name,
			clientKey: project.clientKey,
			allowedOrigins: project.allowedOrigins,
			publicFeedbackVisible: project.publicFeedbackVisible,
			reviewerRepliesEnabled: project.reviewerRepliesEnabled,
			screenshotsEnabled: project.screenshotsEnabled,
			anonymousFeedbackAllowed: project.anonymousFeedbackAllowed,
			openSignups: project.openSignups,
			emailVerificationRequired: project.emailVerificationRequired,
			openCount: project.openCount,
			resolvedCount: project.resolvedCount,
			createdAt: project.createdAt.toISOString()
		}
	};
};
