import { json } from '@sveltejs/kit';
import { api } from '$lib/server/http';
import { baseUrl } from '$lib/server/base-url';
import { toViewerDto } from '$lib/server/services/users';
import { turnstileSiteKey } from '$lib/server/turnstile';
import type { WidgetConfigDto } from '$lib/shared/types';

/** Always available, even anonymously, so the widget can learn that it must sign in. */
export const GET = api(async (event) => {
	const { project } = event.locals.widget!;
	const user = event.locals.user;
	const dto: WidgetConfigDto = {
		project: {
			id: project.id,
			name: project.name,
			publicFeedbackVisible: project.publicFeedbackVisible,
			reviewerRepliesEnabled: project.reviewerRepliesEnabled,
			screenshotsEnabled: project.screenshotsEnabled,
			anonymousFeedbackAllowed: project.anonymousFeedbackAllowed,
			openSignups: project.openSignups
		},
		viewer: user ? toViewerDto(user) : null,
		dashboardUrl: baseUrl(event),
		turnstileSiteKey: turnstileSiteKey()
	};
	return json(dto, { headers: { 'Cache-Control': 'no-store' } });
});
