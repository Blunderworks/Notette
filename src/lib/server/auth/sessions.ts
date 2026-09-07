import { and, eq, lt } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { sessions, users, type Session, type User } from '$lib/server/db/schema';
import { config } from '$lib/server/env';
import { randomToken, sha256 } from '$lib/server/ids';

export const SESSION_COOKIE = 'notette_session';

export type SessionKind = 'dashboard' | 'widget';

export interface CreateSessionOptions {
	userId: string;
	kind: SessionKind;
	projectId?: string | null;
	origin?: string | null;
	userAgent?: string | null;
	ipAddress?: string | null;
}

export interface ValidatedSession {
	session: Session;
	user: User;
	/** True when the expiry was extended (callers should refresh cookies). */
	renewed: boolean;
}

function sessionLifetimeMs(): number {
	return config.sessionDays * 24 * 60 * 60 * 1000;
}

export async function createSession(opts: CreateSessionOptions): Promise<{ token: string; session: Session }> {
	const token = randomToken(32, opts.kind === 'widget' ? 'ntw_' : 'nts_');
	const expiresAt = new Date(Date.now() + sessionLifetimeMs());
	const [session] = await db
		.insert(sessions)
		.values({
			id: sha256(token),
			userId: opts.userId,
			kind: opts.kind,
			projectId: opts.projectId ?? null,
			origin: opts.origin ?? null,
			userAgent: opts.userAgent?.slice(0, 500) ?? null,
			ipAddress: opts.ipAddress?.slice(0, 100) ?? null,
			expiresAt
		})
		.returning();
	return { token, session };
}

/**
 * Looks up a session by raw token. Expired sessions are deleted. Sessions that
 * are past the halfway point of their lifetime are extended (sliding expiry).
 */
export async function validateSession(token: string): Promise<ValidatedSession | null> {
	if (!token || token.length < 20 || token.length > 200) return null;
	const id = sha256(token);
	const rows = await db
		.select({ session: sessions, user: users })
		.from(sessions)
		.innerJoin(users, eq(users.id, sessions.userId))
		.where(eq(sessions.id, id))
		.limit(1);
	const row = rows[0];
	if (!row) return null;

	const now = Date.now();
	if (row.session.expiresAt.getTime() <= now) {
		await db.delete(sessions).where(eq(sessions.id, id));
		return null;
	}

	let renewed = false;
	const remaining = row.session.expiresAt.getTime() - now;
	const patch: Partial<typeof sessions.$inferInsert> = {};
	if (remaining < sessionLifetimeMs() / 2) {
		patch.expiresAt = new Date(now + sessionLifetimeMs());
		renewed = true;
	}
	// Throttle last_used_at writes to once every 5 minutes.
	if (now - row.session.lastUsedAt.getTime() > 5 * 60 * 1000) {
		patch.lastUsedAt = new Date(now);
	}
	if (Object.keys(patch).length > 0) {
		await db.update(sessions).set(patch).where(eq(sessions.id, id));
		Object.assign(row.session, patch);
	}
	return { session: row.session, user: row.user, renewed };
}

export async function invalidateSession(id: string): Promise<void> {
	await db.delete(sessions).where(eq(sessions.id, id));
}

export async function invalidateSessionByToken(token: string): Promise<void> {
	await invalidateSession(sha256(token));
}

export async function invalidateUserSessions(userId: string, exceptId?: string): Promise<void> {
	const rows = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, userId));
	for (const row of rows) {
		if (row.id === exceptId) continue;
		await db.delete(sessions).where(eq(sessions.id, row.id));
	}
}

export async function listUserSessions(userId: string): Promise<Session[]> {
	return db.select().from(sessions).where(eq(sessions.userId, userId)).orderBy(sessions.createdAt);
}

export async function deleteUserSession(userId: string, sessionId: string): Promise<boolean> {
	const deleted = await db
		.delete(sessions)
		.where(and(eq(sessions.userId, userId), eq(sessions.id, sessionId)))
		.returning({ id: sessions.id });
	return deleted.length > 0;
}

export async function deleteExpiredSessions(): Promise<number> {
	const deleted = await db.delete(sessions).where(lt(sessions.expiresAt, new Date())).returning({ id: sessions.id });
	return deleted.length;
}
