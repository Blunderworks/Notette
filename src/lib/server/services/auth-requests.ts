import { timingSafeEqual } from 'node:crypto';
import { eq, lt } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { authRequests, projects, sessions, type AuthRequest, type Project, type User } from '$lib/server/db/schema';
import { createSession } from '$lib/server/auth/sessions';
import { sha256 } from '$lib/server/ids';
import { ApiError } from '$lib/server/http';
import { widgetViewer } from '$lib/server/widget-viewer';
import type { AuthRequestPollDto } from '$lib/shared/types';

/** How long the widget has to complete the sign-in flow. */
const AUTH_REQUEST_TTL_MS = 10 * 60 * 1000;

export async function createAuthRequest(input: {
	id: string;
	projectId: string;
	origin: string;
	pollSecret: string;
}): Promise<AuthRequest> {
	const existing = await getAuthRequest(input.id);
	if (existing) throw new ApiError(409, 'Auth request already exists', 'conflict');
	const [row] = await db
		.insert(authRequests)
		.values({
			id: input.id,
			projectId: input.projectId,
			origin: input.origin,
			pollSecretHash: sha256(input.pollSecret),
			expiresAt: new Date(Date.now() + AUTH_REQUEST_TTL_MS)
		})
		.returning();
	return row;
}

export async function getAuthRequest(id: string): Promise<AuthRequest | null> {
	const [row] = await db.select().from(authRequests).where(eq(authRequests.id, id)).limit(1);
	return row ?? null;
}

export async function getAuthRequestWithProject(
	id: string
): Promise<{ request: AuthRequest; project: Project } | null> {
	const [row] = await db
		.select({ request: authRequests, project: projects })
		.from(authRequests)
		.innerJoin(projects, eq(projects.id, authRequests.projectId))
		.where(eq(authRequests.id, id))
		.limit(1);
	return row ?? null;
}

export function isAuthRequestExpired(request: AuthRequest): boolean {
	return request.expiresAt.getTime() <= Date.now();
}

/**
 * Approves a pending request: creates a widget session bound to the project
 * and origin and parks the raw token on the request until the widget polls.
 */
export async function approveAuthRequest(
	request: AuthRequest,
	user: User,
	ctx: { userAgent?: string | null; ipAddress?: string | null }
): Promise<void> {
	if (request.status !== 'pending') throw new ApiError(409, 'Request is no longer pending', 'conflict');
	if (isAuthRequestExpired(request)) throw new ApiError(410, 'Request has expired', 'expired');

	const { token, session } = await createSession({
		userId: user.id,
		kind: 'widget',
		projectId: request.projectId,
		origin: request.origin,
		userAgent: ctx.userAgent,
		ipAddress: ctx.ipAddress
	});
	await db
		.update(authRequests)
		.set({ status: 'approved', token, sessionId: session.id, approvedById: user.id })
		.where(eq(authRequests.id, request.id));
}

export async function denyAuthRequest(request: AuthRequest): Promise<void> {
	await db.update(authRequests).set({ status: 'denied' }).where(eq(authRequests.id, request.id));
}

function secretMatches(pollSecret: string, hash: string): boolean {
	const a = Buffer.from(sha256(pollSecret), 'hex');
	const b = Buffer.from(hash, 'hex');
	return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Called by the widget. Returns the token exactly once after approval and
 * removes the request afterwards.
 */
export async function pollAuthRequest(
	id: string,
	pollSecret: string,
	projectId: string,
	origin: string
): Promise<{ result: AuthRequestPollDto; user: User | null }> {
	const request = await getAuthRequest(id);
	if (!request || request.projectId !== projectId || request.origin !== origin) {
		throw new ApiError(404, 'Auth request not found', 'not_found');
	}
	if (!secretMatches(pollSecret, request.pollSecretHash)) {
		throw new ApiError(403, 'Invalid poll secret', 'forbidden');
	}
	if (isAuthRequestExpired(request)) {
		await discardAuthRequest(request);
		return { result: { status: 'expired' }, user: null };
	}
	if (request.status === 'denied') {
		await db.delete(authRequests).where(eq(authRequests.id, request.id));
		return { result: { status: 'denied' }, user: null };
	}
	if (request.status === 'approved' && request.token && request.sessionId) {
		const [row] = await db
			.select({ user: sessions.userId })
			.from(sessions)
			.where(eq(sessions.id, request.sessionId))
			.limit(1);
		const userRow = row
			? (await db.query.users.findFirst({ where: (u, { eq }) => eq(u.id, row.user) })) ?? null
			: null;
		if (!userRow) {
			await discardAuthRequest(request);
			return { result: { status: 'expired' }, user: null };
		}
		await db.delete(authRequests).where(eq(authRequests.id, request.id));
		return {
			result: {
				status: 'approved',
				token: request.token,
				viewer: await widgetViewer(userRow, request.projectId)
			},
			user: userRow
		};
	}
	return { result: { status: 'pending' }, user: null };
}

async function discardAuthRequest(request: AuthRequest): Promise<void> {
	// An approved-but-unclaimed request owns a session nobody will ever use.
	if (request.sessionId && request.token) {
		await db.delete(sessions).where(eq(sessions.id, request.sessionId));
	}
	await db.delete(authRequests).where(eq(authRequests.id, request.id));
}

export async function deleteExpiredAuthRequests(): Promise<number> {
	const expired = await db.select().from(authRequests).where(lt(authRequests.expiresAt, new Date()));
	for (const request of expired) await discardAuthRequest(request);
	return expired.length;
}
