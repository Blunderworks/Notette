import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { feedback as feedbackTable } from '$lib/server/db/schema';
import { adminUser, ApiError, api, clientAddress, readJson } from '$lib/server/http';
import { baseUrl } from '$lib/server/base-url';
import { randomToken, sha256 } from '$lib/server/ids';
import { isOriginAllowed, normalizeOrigin } from '$lib/server/origins';
import { rateLimit } from '$lib/server/rate-limit';
import { createFeedback, getFeedbackThread, listFeedback, toDetailDto, toSummaryDto } from '$lib/server/services/feedback';
import { resolveMentions } from '$lib/server/services/mentions';
import { queueFeedbackNotifications } from '$lib/server/services/notifications';
import { requireTurnstile } from '$lib/server/turnstile';
import { feedbackCreateSchema } from '$lib/server/validation';
import { requireWidgetViewer } from '$lib/server/widget-access';
import type { FeedbackListDto } from '$lib/shared/types';

export const GET = api(async (event) => {
	const { project } = event.locals.widget!;
	requireWidgetViewer(event);
	const admin = adminUser(event);
	if (!admin && !project.publicFeedbackVisible) {
		return json({ items: [], total: 0 } satisfies FeedbackListDto);
	}

	const params = event.url.searchParams;
	const scope = params.get('scope') === 'project' ? 'project' : 'page';
	const path = params.get('path');
	if (scope === 'project' && !admin) {
		throw new ApiError(403, 'Browsing the whole project requires admin access', 'forbidden');
	}
	if (scope === 'page' && (path === null || path.length > 2048)) {
		throw new ApiError(400, 'A path is required', 'bad_request');
	}
	const statusParam = params.get('status');
	const status = statusParam === 'open' || statusParam === 'resolved' ? statusParam : 'all';
	const q = params.get('q')?.slice(0, 200) ?? undefined;
	const limit = Number.parseInt(params.get('limit') ?? '200', 10) || 200;
	const offset = Number.parseInt(params.get('offset') ?? '0', 10) || 0;

	const { items, total } = await listFeedback({
		projectId: project.id,
		path: scope === 'page' ? path! : undefined,
		status,
		q,
		limit,
		offset
	});
	return json({ items: items.map(toSummaryDto), total } satisfies FeedbackListDto, {
		headers: { 'Cache-Control': 'no-store' }
	});
});

export const POST = api(async (event) => {
	const { project, origin } = event.locals.widget!;
	const user = requireWidgetViewer(event);
	const admin = adminUser(event);

	if (!admin) {
		const limit = rateLimit(`feedback:${project.id}:${user?.id ?? clientAddress(event)}`, 30, 10 * 60 * 1000);
		if (!limit.ok) {
			throw new ApiError(429, 'Too many submissions, please try again later', 'rate_limited', {
				retryAfter: limit.retryAfter
			});
		}
	}

	const input = await readJson(event.request, feedbackCreateSchema, 200_000);
	// Bot protection applies to anonymous reviewers only; signed-in users already authenticated.
	if (!user) await requireTurnstile(event, project, input.turnstileToken);

	const pageOrigin = normalizeOrigin(input.page.url);
	if (!pageOrigin || (pageOrigin !== origin && !isOriginAllowed(pageOrigin, project.allowedOrigins))) {
		throw new ApiError(400, 'Page URL does not belong to an allowed origin', 'bad_page_url');
	}

	// Mentions are only honoured for signed-in authors and only for people they may mention.
	const mentions = await resolveMentions(user, project.id, input.mentions);
	const created = await createFeedback(project, input, {
		user,
		userAgent: event.request.headers.get('user-agent'),
		mentions
	});

	let uploadToken: string | null = null;
	if (project.screenshotsEnabled) {
		uploadToken = randomToken(24, 'ntu_');
		await db
			.update(feedbackTable)
			.set({ uploadTokenHash: sha256(uploadToken) })
			.where(eq(feedbackTable.id, created.id));
	}

	const thread = await getFeedbackThread(created.id);
	if (!thread) throw new ApiError(500, 'Feedback vanished after creation', 'internal_error');
	await queueFeedbackNotifications(thread.item, user);
	return json(
		{ item: toDetailDto(thread, baseUrl(event)), uploadToken },
		{ status: 201, headers: { 'Cache-Control': 'no-store' } }
	);
});
