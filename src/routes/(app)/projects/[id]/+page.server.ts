import type { PageServerLoad } from './$types';
import { listFeedback, toSummaryDto } from '$lib/server/services/feedback';

const PAGE_SIZE = 25;

export const load: PageServerLoad = async ({ url, parent }) => {
	const { project } = await parent();
	const statusParam = url.searchParams.get('status') ?? 'open';
	const status = statusParam === 'open' || statusParam === 'resolved' ? statusParam : 'all';
	const q = url.searchParams.get('q')?.slice(0, 200) ?? '';
	const currentPage = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1);

	const result = await listFeedback({
		projectId: project.id,
		status,
		q: q || undefined,
		limit: PAGE_SIZE,
		offset: (currentPage - 1) * PAGE_SIZE
	});

	return {
		filters: { status, q },
		items: result.items.map((row) => ({ ...toSummaryDto(row), projectId: row.projectId, projectName: row.projectName })),
		total: result.total,
		page: currentPage,
		pageSize: PAGE_SIZE
	};
};
