import { asc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { comments, feedback, type Comment } from '$lib/server/db/schema';
import type { CommentDto } from '$lib/shared/types';

export async function listComments(feedbackId: string): Promise<Comment[]> {
	return db.select().from(comments).where(eq(comments.feedbackId, feedbackId)).orderBy(asc(comments.createdAt));
}

export async function addComment(input: {
	feedbackId: string;
	body: string;
	authorName?: string | null;
	authorEmail?: string | null;
	userId?: string | null;
}): Promise<Comment> {
	return db.transaction(async (tx) => {
		const [row] = await tx
			.insert(comments)
			.values({
				feedbackId: input.feedbackId,
				body: input.body,
				authorName: input.authorName ?? null,
				authorEmail: input.authorEmail ?? null,
				userId: input.userId ?? null
			})
			.returning();
		await tx.update(feedback).set({ updatedAt: new Date() }).where(eq(feedback.id, input.feedbackId));
		return row;
	});
}

export async function deleteComment(id: string): Promise<boolean> {
	const deleted = await db.delete(comments).where(eq(comments.id, id)).returning({ id: comments.id });
	return deleted.length > 0;
}

export function toCommentDto(c: Comment): CommentDto {
	return {
		id: c.id,
		body: c.body,
		authorName: c.authorName,
		isAdmin: c.userId !== null,
		createdAt: c.createdAt.toISOString()
	};
}
