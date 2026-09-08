import { json } from '@sveltejs/kit';
import { api, readJson, requireUser } from '$lib/server/http';
import { setEmailNotifications } from '$lib/server/services/notifications';
import { notificationPreferencesSchema } from '$lib/server/validation';
import type { NotificationPreferencesDto } from '$lib/shared/types';

/** Turns email notifications for this project on or off for the signed-in viewer. */
export const PUT = api(async (event) => {
	const { project } = event.locals.widget!;
	const user = requireUser(event);
	const input = await readJson(event.request, notificationPreferencesSchema);
	await setEmailNotifications(user.id, project.id, input.email);
	return json({ email: input.email } satisfies NotificationPreferencesDto, { headers: { 'Cache-Control': 'no-store' } });
});
