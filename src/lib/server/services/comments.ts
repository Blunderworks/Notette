import { asc, eq, getTableColumns } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { comments, feedback, users, type Comment } from '$lib/server/db/schema';
import { isAdminRole, type UserRole } from '$lib/shared/roles';
import type { CommentDto, MentionRef } from '$lib/shared/types';

/** A comment plus the current role of its author (null for anonymous or deleted accounts). */
export interface CommentRow extends Comment {
	authorRole: UserRole | null;
}

export async function listComments(feedbackId: string): Promise<CommentRow[]> {
	return db
		.select({ ...getTableColumns(comments), authorRole: users.role })
		.from(comments)
		.leftJoin(users, eq(users.id, comments.userId))
		.where(eq(comments.feedbackId, feedbackId))
		.orderBy(asc(comments.createdAt));
}

export async function addComment(input: {
	feedbackId: string;
	body: string;
	authorName?: string | null;
	authorEmail?: string | null;
	userId?: string | null;
	authorRole?: UserRole | null;
	/** Already validated with `resolveMentions()`. */
	mentions?: MentionRef[] | null;
}): Promise<CommentRow> {
	return db.transaction(async (tx) => {
		const [row] = await tx
			.insert(comments)
			.values({
				feedbackId: input.feedbackId,
				body: input.body,
				authorName: input.authorName ?? null,
				authorEmail: input.authorEmail ?? null,
				userId: input.userId ?? null,
				mentions: input.mentions?.length ? input.mentions : null
			})
			.returning();
		await tx.update(feedback).set({ updatedAt: new Date() }).where(eq(feedback.id, input.feedbackId));
		return { ...row, authorRole: input.userId ? (input.authorRole ?? null) : null };
	});
}

export async function deleteComment(id: string): Promise<boolean> {
	const deleted = await db.delete(comments).where(eq(comments.id, id)).returning({ id: comments.id });
	return deleted.length > 0;
}

export function toCommentDto(c: CommentRow): CommentDto {
	return {
		id: c.id,
		body: c.body,
		authorName: c.authorName,
		isAdmin: isAdminRole(c.authorRole),
		isMember: c.authorRole === 'member',
		mentions: (c.mentions ?? []).map((m) => m.name),
		createdAt: c.createdAt.toISOString()
	};
}
