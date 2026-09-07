import { and, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	comments,
	feedback,
	projects,
	uploads,
	users,
	type Feedback,
	type Project,
	type Upload,
	type User
} from '$lib/server/db/schema';
import type { FeedbackCreateInput } from '$lib/server/validation';
import { isAdminRole, type UserRole } from '$lib/shared/roles';
import type { FeedbackDetailDto, FeedbackStatus, FeedbackSummaryDto } from '$lib/shared/types';
import { listComments, toCommentDto, type CommentRow } from './comments';
import { deleteFilesForFeedback, getScreenshotForFeedback } from './uploads';

export interface FeedbackRow extends Feedback {
	commentCount: number;
	screenshotId: string | null;
	projectName: string;
	/** Current role of the signed-in author, null for anonymous reviewers or deleted accounts. */
	authorRole: UserRole | null;
}

export interface FeedbackFilters {
	projectId?: string;
	path?: string;
	status?: FeedbackStatus | 'all';
	q?: string;
	limit?: number;
	offset?: number;
}

const commentCount = sql<number>`(select count(*)::int from ${comments} c where c.feedback_id = ${feedback.id})`;
const screenshotId = sql<string | null>`(select u.id from ${uploads} u where u.feedback_id = ${feedback.id} and u.kind = 'screenshot' order by u.created_at desc limit 1)`;

function selectColumns() {
	return {
		id: feedback.id,
		projectId: feedback.projectId,
		number: feedback.number,
		status: feedback.status,
		body: feedback.body,
		authorName: feedback.authorName,
		authorEmail: feedback.authorEmail,
		userId: feedback.userId,
		url: feedback.url,
		path: feedback.path,
		pageTitle: feedback.pageTitle,
		viewportWidth: feedback.viewportWidth,
		viewportHeight: feedback.viewportHeight,
		devicePixelRatio: feedback.devicePixelRatio,
		scrollX: feedback.scrollX,
		scrollY: feedback.scrollY,
		clickX: feedback.clickX,
		clickY: feedback.clickY,
		elementSelector: feedback.elementSelector,
		elementXpath: feedback.elementXpath,
		elementTag: feedback.elementTag,
		elementText: feedback.elementText,
		elementAttributes: feedback.elementAttributes,
		elementRect: feedback.elementRect,
		elementRelX: feedback.elementRelX,
		elementRelY: feedback.elementRelY,
		userAgent: feedback.userAgent,
		uploadTokenHash: feedback.uploadTokenHash,
		deployment: feedback.deployment,
		metadata: feedback.metadata,
		resolvedAt: feedback.resolvedAt,
		resolvedById: feedback.resolvedById,
		createdAt: feedback.createdAt,
		updatedAt: feedback.updatedAt,
		commentCount,
		screenshotId,
		projectName: projects.name,
		authorRole: users.role
	};
}

function escapeLike(value: string): string {
	return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

function buildConditions(filters: FeedbackFilters): SQL | undefined {
	const conditions: SQL[] = [];
	if (filters.projectId) conditions.push(eq(feedback.projectId, filters.projectId));
	if (filters.path !== undefined) conditions.push(eq(feedback.path, filters.path));
	if (filters.status && filters.status !== 'all') conditions.push(eq(feedback.status, filters.status));
	const q = filters.q?.trim();
	if (q) {
		const pattern = `%${escapeLike(q)}%`;
		const parts: SQL[] = [
			ilike(feedback.body, pattern),
			ilike(feedback.path, pattern),
			ilike(feedback.url, pattern),
			ilike(feedback.pageTitle, pattern),
			ilike(feedback.authorName, pattern),
			ilike(feedback.elementText, pattern),
			ilike(feedback.elementSelector, pattern)
		];
		const numberMatch = /^#?(\d{1,9})$/.exec(q);
		if (numberMatch) parts.push(eq(feedback.number, Number.parseInt(numberMatch[1], 10)));
		conditions.push(or(...parts) as SQL);
	}
	return conditions.length ? and(...conditions) : undefined;
}

export async function listFeedback(filters: FeedbackFilters): Promise<{ items: FeedbackRow[]; total: number }> {
	const where = buildConditions(filters);
	const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
	const offset = Math.max(filters.offset ?? 0, 0);

	const items = await db
		.select(selectColumns())
		.from(feedback)
		.innerJoin(projects, eq(projects.id, feedback.projectId))
		.leftJoin(users, eq(users.id, feedback.userId))
		.where(where)
		.orderBy(desc(feedback.createdAt))
		.limit(limit)
		.offset(offset);

	const [countRow] = await db.select({ count: sql<number>`count(*)::int` }).from(feedback).where(where);

	return { items, total: countRow?.count ?? 0 };
}

export async function getFeedback(id: string): Promise<FeedbackRow | null> {
	const [row] = await db
		.select(selectColumns())
		.from(feedback)
		.innerJoin(projects, eq(projects.id, feedback.projectId))
		.leftJoin(users, eq(users.id, feedback.userId))
		.where(eq(feedback.id, id))
		.limit(1);
	return row ?? null;
}

export interface FeedbackThread {
	item: FeedbackRow;
	comments: CommentRow[];
	screenshot: Upload | null;
}

export async function getFeedbackThread(id: string): Promise<FeedbackThread | null> {
	const item = await getFeedback(id);
	if (!item) return null;
	const [threadComments, screenshot] = await Promise.all([listComments(id), getScreenshotForFeedback(id)]);
	return { item, comments: threadComments, screenshot };
}

export async function createFeedback(
	project: Project,
	input: FeedbackCreateInput,
	ctx: { user?: User | null; userAgent?: string | null }
): Promise<Feedback> {
	const pageUrl = new URL(input.page.url);
	// Signed-in users (admins and members) always post under their account identity.
	const author = ctx.user
		? { name: ctx.user.name, email: ctx.user.email, userId: ctx.user.id }
		: { name: input.author?.name ?? null, email: input.author?.email ?? null, userId: null };

	return db.transaction(async (tx) => {
		const [seq] = await tx
			.update(projects)
			.set({ feedbackSeq: sql`${projects.feedbackSeq} + 1` })
			.where(eq(projects.id, project.id))
			.returning({ number: projects.feedbackSeq });
		if (!seq) throw new Error('Project disappeared while creating feedback');

		const [row] = await tx
			.insert(feedback)
			.values({
				projectId: project.id,
				number: seq.number,
				body: input.body,
				authorName: author.name,
				authorEmail: author.email,
				userId: author.userId,
				url: pageUrl.toString(),
				path: pageUrl.pathname,
				pageTitle: input.page.title ?? null,
				viewportWidth: input.page.viewportWidth,
				viewportHeight: input.page.viewportHeight,
				devicePixelRatio: input.page.devicePixelRatio ?? null,
				scrollX: input.page.scrollX,
				scrollY: input.page.scrollY,
				clickX: input.click?.x ?? null,
				clickY: input.click?.y ?? null,
				elementSelector: input.element?.selector ?? null,
				elementXpath: input.element?.xpath ?? null,
				elementTag: input.element?.tag ?? null,
				elementText: input.element?.text ?? null,
				elementAttributes: input.element?.attributes ?? null,
				elementRect: input.element?.rect ?? null,
				elementRelX: input.element?.relX ?? null,
				elementRelY: input.element?.relY ?? null,
				userAgent: input.page.userAgent ?? ctx.userAgent?.slice(0, 500) ?? null,
				deployment: input.deployment && Object.keys(input.deployment).length ? input.deployment : null,
				metadata: input.metadata && Object.keys(input.metadata).length ? input.metadata : null
			})
			.returning();
		return row;
	});
}

export async function setFeedbackStatus(id: string, status: FeedbackStatus, user: User): Promise<Feedback | null> {
	const [row] = await db
		.update(feedback)
		.set({
			status,
			resolvedAt: status === 'resolved' ? new Date() : null,
			resolvedById: status === 'resolved' ? user.id : null,
			updatedAt: new Date()
		})
		.where(eq(feedback.id, id))
		.returning();
	return row ?? null;
}

export async function deleteFeedback(id: string): Promise<boolean> {
	await deleteFilesForFeedback(id);
	const deleted = await db.delete(feedback).where(eq(feedback.id, id)).returning({ id: feedback.id });
	return deleted.length > 0;
}

export function toSummaryDto(row: FeedbackRow): FeedbackSummaryDto {
	return {
		id: row.id,
		number: row.number,
		status: row.status,
		body: row.body,
		url: row.url,
		path: row.path,
		pageTitle: row.pageTitle,
		authorName: row.authorName,
		isAdmin: isAdminRole(row.authorRole),
		isMember: row.authorRole === 'member',
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
		resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
		commentCount: row.commentCount,
		hasScreenshot: row.screenshotId !== null,
		viewportWidth: row.viewportWidth,
		viewportHeight: row.viewportHeight,
		scrollX: row.scrollX,
		scrollY: row.scrollY,
		clickX: row.clickX,
		clickY: row.clickY,
		elementSelector: row.elementSelector,
		elementXpath: row.elementXpath,
		elementTag: row.elementTag,
		elementText: row.elementText,
		elementRect: row.elementRect,
		elementRelX: row.elementRelX,
		elementRelY: row.elementRelY,
		deployment: row.deployment
	};
}

export function screenshotUrl(baseUrl: string, upload: Upload | null): string | null {
	return upload ? `${baseUrl}/uploads/${upload.id}` : null;
}

export function toDetailDto(
	thread: FeedbackThread,
	baseUrl: string,
	opts: { includeEmail?: boolean } = {}
): FeedbackDetailDto {
	const dto: FeedbackDetailDto = {
		...toSummaryDto(thread.item),
		comments: thread.comments.map(toCommentDto),
		screenshotUrl: screenshotUrl(baseUrl, thread.screenshot),
		elementAttributes: thread.item.elementAttributes,
		devicePixelRatio: thread.item.devicePixelRatio,
		userAgent: thread.item.userAgent,
		metadata: thread.item.metadata
	};
	if (opts.includeEmail) dto.authorEmail = thread.item.authorEmail;
	return dto;
}
