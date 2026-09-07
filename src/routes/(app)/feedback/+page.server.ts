import type { PageServerLoad } from './$types';
import { isUuid } from '$lib/server/ids';
import { listFeedback, toSummaryDto } from '$lib/server/services/feedback';
import { listProjects } from '$lib/server/services/projects';

const PAGE_SIZE = 25;

export const load: PageServerLoad = async ({ url }) => {
	const statusParam = url.searchParams.get('status') ?? 'open';
	const status = statusParam === 'open' || statusParam === 'resolved' ? statusParam : 'all';
	const q = url.searchParams.get('q')?.slice(0, 200) ?? '';
	const projectParam = url.searchParams.get('project') ?? '';
	const projectId = isUuid(projectParam) ? projectParam : '';
	const currentPage = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1);

	const [projects, result] = await Promise.all([
		listProjects(),
		listFeedback({
			projectId: projectId || undefined,
			status,
			q: q || undefined,
			limit: PAGE_SIZE,
			offset: (currentPage - 1) * PAGE_SIZE
		})
	]);

	return {
		filters: { status, q, projectId },
		projects: projects.map((p) => ({ id: p.id, name: p.name })),
		items: result.items.map((row) => ({ ...toSummaryDto(row), projectId: row.projectId, projectName: row.projectName })),
		total: result.total,
		page: currentPage,
		pageSize: PAGE_SIZE
	};
};
