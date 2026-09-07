import type { PageServerLoad } from './$types';
import { listFeedback, toSummaryDto } from '$lib/server/services/feedback';
import { listProjectsForMember } from '$lib/server/services/members';
import { listProjects } from '$lib/server/services/projects';
import { baseUrl } from '$lib/server/base-url';
import { isAdminRole } from '$lib/shared/roles';

export const load: PageServerLoad = async (event) => {
	const user = event.locals.user!;
	if (!isAdminRole(user.role)) {
		// Members get a minimal home: the projects they belong to and where to use the widget.
		const projects = await listProjectsForMember(user.id);
		return {
			member: true as const,
			memberProjects: projects.map((p) => ({
				id: p.id,
				name: p.name,
				sites: p.allowedOrigins.filter((o) => !o.includes('*'))
			}))
		};
	}

	const [projects, recent] = await Promise.all([listProjects(), listFeedback({ status: 'open', limit: 10 })]);
	return {
		member: false as const,
		baseUrl: baseUrl(event),
		projects: projects.map((p) => ({
			id: p.id,
			name: p.name,
			openCount: p.openCount,
			resolvedCount: p.resolvedCount,
			lastFeedbackAt: p.lastFeedbackAt?.toISOString() ?? null,
			allowedOrigins: p.allowedOrigins
		})),
		recent: recent.items.map((row) => ({ ...toSummaryDto(row), projectId: row.projectId, projectName: row.projectName })),
		openTotal: recent.total
	};
};
