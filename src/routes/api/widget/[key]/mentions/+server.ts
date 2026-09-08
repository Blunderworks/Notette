import { json } from '@sveltejs/kit';
import { api, requireUser } from '$lib/server/http';
import { listMentionCandidates } from '$lib/server/services/mentions';
import type { MentionCandidateDto } from '$lib/shared/types';

/** People the signed-in viewer may @-mention on this project (see *Mentions* in ARCHITECTURE.md). */
export const GET = api(async (event) => {
	const { project } = event.locals.widget!;
	const user = requireUser(event);
	const users: MentionCandidateDto[] = await listMentionCandidates(user, project.id);
	return json({ users }, { headers: { 'Cache-Control': 'no-store' } });
});
