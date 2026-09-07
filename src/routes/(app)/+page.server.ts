import type { PageServerLoad } from './$types';
import { listFeedback, toSummaryDto } from '$lib/server/services/feedback';
import { listProjects } from '$lib/server/services/projects';
import { baseUrl } from '$lib/server/base-url';

export const load: PageServerLoad = async (event) => {
	const [projects, recent] = await Promise.all([listProjects(), listFeedback({ status: 'open', limit: 10 })]);
	return {
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
