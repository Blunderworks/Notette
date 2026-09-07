import { json } from '@sveltejs/kit';
import { api } from '$lib/server/http';
import { baseUrl } from '$lib/server/base-url';
import type { WidgetConfigDto } from '$lib/shared/types';

export const GET = api(async (event) => {
	const { project } = event.locals.widget!;
	const user = event.locals.user;
	const dto: WidgetConfigDto = {
		project: {
			id: project.id,
			name: project.name,
			publicFeedbackVisible: project.publicFeedbackVisible,
			reviewerRepliesEnabled: project.reviewerRepliesEnabled,
			screenshotsEnabled: project.screenshotsEnabled
		},
		viewer: user ? { admin: true, name: user.name, email: user.email } : null,
		dashboardUrl: baseUrl(event)
	};
	return json(dto, { headers: { 'Cache-Control': 'no-store' } });
});
