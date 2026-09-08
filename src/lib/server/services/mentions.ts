import { eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { projectMembers, users, type User } from '$lib/server/db/schema';
import { isAdminRole } from '$lib/shared/roles';
import type { MentionCandidateDto, MentionRef } from '$lib/shared/types';

/** Hard cap on mentions per feedback item or reply. */
export const MAX_MENTIONS = 20;

/**
 * Who `user` may @-mention on a project: everyone added to the project, plus
 * (for owners/admins) every owner and admin. Members only see fellow project
 * members so the list of admin accounts is not exposed to them. The user
 * themself is excluded. Anonymous authors cannot mention anyone.
 */
export async function listMentionCandidates(user: User, projectId: string): Promise<MentionCandidateDto[]> {
	const byId = new Map<string, MentionCandidateDto>();
	const members = await db
		.select({ id: users.id, name: users.name, role: users.role })
		.from(projectMembers)
		.innerJoin(users, eq(users.id, projectMembers.userId))
		.where(eq(projectMembers.projectId, projectId));
	for (const row of members) byId.set(row.id, { id: row.id, name: row.name, admin: isAdminRole(row.role) });
	if (isAdminRole(user.role)) {
		const admins = await db
			.select({ id: users.id, name: users.name, role: users.role })
			.from(users)
			.where(inArray(users.role, ['owner', 'admin']));
		for (const row of admins) byId.set(row.id, { id: row.id, name: row.name, admin: true });
	}
	byId.delete(user.id);
	return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Turns submitted user ids into stored mention references, keeping only
 * people the author is allowed to mention. Unknown ids are dropped silently.
 */
export async function resolveMentions(
	user: User | null,
	projectId: string,
	ids: readonly string[] | undefined
): Promise<MentionRef[]> {
	if (!user || !ids?.length) return [];
	const wanted = new Set(ids);
	const candidates = await listMentionCandidates(user, projectId);
	return candidates
		.filter((candidate) => wanted.has(candidate.id))
		.slice(0, MAX_MENTIONS)
		.map(({ id, name }) => ({ id, name }));
}
