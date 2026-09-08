import { and, asc, eq, gte, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	comments,
	feedback,
	notificationMutes,
	notifications,
	projectMembers,
	projects,
	users,
	type Comment,
	type Feedback,
	type NotificationKind,
	type User
} from '$lib/server/db/schema';
import { config } from '$lib/server/env';
import { buildDigest, type DigestItem } from '$lib/server/email/digest';
import { sendEmail } from '$lib/server/email/mailer';
import { isAdminRole } from '$lib/shared/roles';
import type { FeedbackThread } from './feedback';

/** Delivery attempts before a batch is abandoned. */
const MAX_ATTEMPTS = 5;
/** How often the scheduler looks for due batches. */
const TICK_MS = 15_000;
/** Sent rows are kept briefly for debugging, then removed by maintenance. */
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Preferences (per user and project; a mute row means "off")
// ---------------------------------------------------------------------------

export async function isEmailNotificationsEnabled(userId: string, projectId: string): Promise<boolean> {
	const [row] = await db
		.select({ userId: notificationMutes.userId })
		.from(notificationMutes)
		.where(and(eq(notificationMutes.userId, userId), eq(notificationMutes.projectId, projectId)))
		.limit(1);
	return !row;
}

export async function setEmailNotifications(userId: string, projectId: string, enabled: boolean): Promise<void> {
	if (enabled) {
		await db
			.delete(notificationMutes)
			.where(and(eq(notificationMutes.userId, userId), eq(notificationMutes.projectId, projectId)));
	} else {
		await db.insert(notificationMutes).values({ userId, projectId }).onConflictDoNothing();
	}
}

// ---------------------------------------------------------------------------
// Queueing
// ---------------------------------------------------------------------------

interface Recipient {
	userId: string;
	kind: NotificationKind;
}

/**
 * Everyone who should hear about an event: all owners/admins, the thread's
 * signed-in participants, and mentioned users (who get the `mention` kind).
 * The author, unverified accounts, members no longer on the project and
 * users who muted the project are dropped. Anonymous participants are never
 * emailed: their addresses are unverified free text.
 */
async function resolveRecipients(input: {
	projectId: string;
	authorId: string | null;
	participantIds: string[];
	mentionedIds: string[];
	kind: 'feedback' | 'comment';
}): Promise<Recipient[]> {
	const kinds = new Map<string, NotificationKind>();
	const admins = await db
		.select({ id: users.id })
		.from(users)
		.where(inArray(users.role, ['owner', 'admin']));
	for (const admin of admins) kinds.set(admin.id, input.kind);
	for (const id of input.participantIds) if (!kinds.has(id)) kinds.set(id, input.kind);
	for (const id of input.mentionedIds) kinds.set(id, 'mention');
	if (input.authorId) kinds.delete(input.authorId);
	if (!kinds.size) return [];

	const rows = await db
		.select({
			id: users.id,
			role: users.role,
			verifiedAt: users.emailVerifiedAt,
			memberOf: projectMembers.userId,
			muted: notificationMutes.userId
		})
		.from(users)
		.leftJoin(projectMembers, and(eq(projectMembers.userId, users.id), eq(projectMembers.projectId, input.projectId)))
		.leftJoin(notificationMutes, and(eq(notificationMutes.userId, users.id), eq(notificationMutes.projectId, input.projectId)))
		.where(inArray(users.id, [...kinds.keys()]));
	return rows
		.filter((row) => row.verifiedAt && !row.muted && (isAdminRole(row.role) || row.memberOf))
		.map((row) => ({ userId: row.id, kind: kinds.get(row.id)! }));
}

async function enqueue(recipients: Recipient[], base: { projectId: string; feedbackId: string; commentId: string | null }): Promise<void> {
	if (!recipients.length) return;
	await db.insert(notifications).values(
		recipients.map((r) => ({
			userId: r.userId,
			projectId: base.projectId,
			feedbackId: base.feedbackId,
			commentId: base.commentId,
			kind: r.kind
		}))
	);
}

/** Queues notifications for a newly created feedback item. Never throws. */
export async function queueFeedbackNotifications(item: Feedback, author: User | null): Promise<void> {
	if (!config.emailEnabled) return;
	try {
		const recipients = await resolveRecipients({
			projectId: item.projectId,
			authorId: author?.id ?? null,
			participantIds: [],
			mentionedIds: (item.mentions ?? []).map((m) => m.id),
			kind: 'feedback'
		});
		await enqueue(recipients, { projectId: item.projectId, feedbackId: item.id, commentId: null });
	} catch (err) {
		console.warn('[notette] Could not queue feedback notifications', err);
	}
}

/** Queues notifications for a new reply on `thread`. Never throws. */
export async function queueCommentNotifications(thread: FeedbackThread, comment: Comment, author: User | null): Promise<void> {
	if (!config.emailEnabled) return;
	try {
		const participantIds = new Set<string>();
		if (thread.item.userId) participantIds.add(thread.item.userId);
		for (const existing of thread.comments) if (existing.userId) participantIds.add(existing.userId);
		const recipients = await resolveRecipients({
			projectId: thread.item.projectId,
			authorId: author?.id ?? null,
			participantIds: [...participantIds],
			mentionedIds: (comment.mentions ?? []).map((m) => m.id),
			kind: 'comment'
		});
		await enqueue(recipients, { projectId: thread.item.projectId, feedbackId: thread.item.id, commentId: comment.id });
	} catch (err) {
		console.warn('[notette] Could not queue comment notifications', err);
	}
}

// ---------------------------------------------------------------------------
// Sending (batched per recipient)
// ---------------------------------------------------------------------------

let flushing = false;

/**
 * Sends one digest to every recipient whose oldest pending notification is
 * older than the batch delay. Rows are marked sent only after SMTP accepted
 * the message; failures back off and are abandoned after MAX_ATTEMPTS.
 * Returns the number of emails sent.
 */
export async function flushNotifications(now = new Date()): Promise<number> {
	if (!config.emailEnabled || flushing) return 0;
	flushing = true;
	try {
		const cutoff = new Date(now.getTime() - config.emailBatchSeconds * 1000);
		const due = await db
			.select({ userId: notifications.userId })
			.from(notifications)
			.where(pending(now))
			.groupBy(notifications.userId)
			// min() loses the column's Date mapping, so pass the cutoff as an explicit timestamptz literal.
			.having(sql`min(${notifications.createdAt}) <= ${cutoff.toISOString()}::timestamptz`);
		let sent = 0;
		for (const { userId } of due) {
			if (await sendDigestTo(userId, now)) sent += 1;
		}
		return sent;
	} finally {
		flushing = false;
	}
}

function pending(now: Date) {
	return and(
		isNull(notifications.sentAt),
		lt(notifications.attempts, MAX_ATTEMPTS),
		or(isNull(notifications.nextAttemptAt), lte(notifications.nextAttemptAt, now))
	);
}

async function sendDigestTo(userId: string, now: Date): Promise<boolean> {
	const [recipient] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
	if (!recipient) return false;
	const rows = await db
		.select({
			id: notifications.id,
			kind: notifications.kind,
			createdAt: notifications.createdAt,
			projectId: projects.id,
			projectName: projects.name,
			feedbackId: feedback.id,
			number: feedback.number,
			url: feedback.url,
			path: feedback.path,
			pageTitle: feedback.pageTitle,
			feedbackBody: feedback.body,
			feedbackAuthor: feedback.authorName,
			feedbackMentions: feedback.mentions,
			commentId: comments.id,
			commentBody: comments.body,
			commentAuthor: comments.authorName,
			commentMentions: comments.mentions
		})
		.from(notifications)
		.innerJoin(feedback, eq(feedback.id, notifications.feedbackId))
		.innerJoin(projects, eq(projects.id, notifications.projectId))
		.leftJoin(comments, eq(comments.id, notifications.commentId))
		.where(and(eq(notifications.userId, userId), pending(now)))
		.orderBy(asc(notifications.createdAt));
	if (!rows.length) return false;

	const items: DigestItem[] = rows.map((row) => ({
		kind: row.kind,
		projectId: row.projectId,
		projectName: row.projectName,
		feedbackId: row.feedbackId,
		number: row.number,
		url: row.url,
		path: row.path,
		pageTitle: row.pageTitle,
		feedbackBody: row.feedbackBody,
		feedbackAuthor: row.feedbackAuthor,
		feedbackMentions: (row.feedbackMentions ?? []).map((m) => m.name),
		commentId: row.commentId,
		commentBody: row.commentBody,
		commentAuthor: row.commentAuthor,
		commentMentions: (row.commentMentions ?? []).map((m) => m.name),
		createdAt: row.createdAt
	}));
	const email = buildDigest(items, {
		recipientName: recipient.name,
		recipientIsAdmin: isAdminRole(recipient.role),
		baseUrl: config.publicUrl
	});
	const ids = rows.map((row) => row.id);
	try {
		await sendEmail({ to: recipient.email, ...email });
		await db
			.update(notifications)
			.set({ sentAt: new Date(), attempts: sql`${notifications.attempts} + 1`, lastError: null })
			.where(inArray(notifications.id, ids));
		return true;
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.warn(`[notette] Could not send notification email to ${recipient.email}: ${message}`);
		// Back off: 2, 4, 6… minutes between retries.
		await db
			.update(notifications)
			.set({
				attempts: sql`${notifications.attempts} + 1`,
				nextAttemptAt: sql`now() + (${notifications.attempts} + 1) * interval '2 minutes'`,
				lastError: message.slice(0, 500)
			})
			.where(inArray(notifications.id, ids));
		return false;
	}
}

// ---------------------------------------------------------------------------
// Scheduler and maintenance
// ---------------------------------------------------------------------------

let timer: ReturnType<typeof setInterval> | null = null;

/** Starts the periodic flush (idempotent, no-op when email is not configured). */
export function startNotificationScheduler(): void {
	if (timer || !config.emailEnabled) return;
	timer = setInterval(() => {
		flushNotifications().catch((err) => console.warn('[notette] Notification flush failed', err));
	}, TICK_MS);
	timer.unref();
}

export function stopNotificationScheduler(): void {
	if (timer) clearInterval(timer);
	timer = null;
}

/** Removes sent rows past retention and abandoned rows; called from hourly maintenance. */
export async function cleanupNotifications(now = new Date()): Promise<void> {
	const cutoff = new Date(now.getTime() - RETENTION_MS);
	await db.delete(notifications).where(lt(notifications.sentAt, cutoff));
	await db
		.delete(notifications)
		.where(and(isNull(notifications.sentAt), gte(notifications.attempts, MAX_ATTEMPTS), lt(notifications.createdAt, cutoff)));
}
