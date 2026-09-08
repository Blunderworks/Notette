import type { User } from '$lib/server/db/schema';
import { config } from '$lib/server/env';
import { isEmailNotificationsEnabled } from '$lib/server/services/notifications';
import { toViewerDto } from '$lib/server/services/users';
import type { WidgetViewerDto } from '$lib/shared/types';

/**
 * Viewer identity for the widget including the per-project notification
 * preference. Used wherever the widget receives a viewer (config, sign-in,
 * sign-up, dashboard approval).
 */
export async function widgetViewer(user: User, projectId: string): Promise<WidgetViewerDto> {
	const viewer = toViewerDto(user);
	if (config.emailEnabled) viewer.emailNotifications = await isEmailNotificationsEnabled(user.id, projectId);
	return viewer;
}
