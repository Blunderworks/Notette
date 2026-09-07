import { and, asc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { projectMembers, projects, sessions, users, type Project, type User } from '$lib/server/db/schema';
import { isAdminRole } from '$lib/shared/roles';

export interface ProjectMemberRow {
	userId: string;
	email: string;
	name: string;
	role: User['role'];
	createdAt: Date;
}

/** Users explicitly added to a project, oldest first. */
export async function listProjectMembers(projectId: string): Promise<ProjectMemberRow[]> {
	return db
		.select({
			userId: users.id,
			email: users.email,
			name: users.name,
			role: users.role,
			createdAt: projectMembers.createdAt
		})
		.from(projectMembers)
		.innerJoin(users, eq(users.id, projectMembers.userId))
		.where(eq(projectMembers.projectId, projectId))
		.orderBy(asc(projectMembers.createdAt));
}

export async function isProjectMember(projectId: string, userId: string): Promise<boolean> {
	const [row] = await db
		.select({ userId: projectMembers.userId })
		.from(projectMembers)
		.where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
		.limit(1);
	return !!row;
}

/** Idempotent: adding an existing member is a no-op. */
export async function addProjectMember(projectId: string, userId: string, addedById: string | null = null): Promise<void> {
	await db.insert(projectMembers).values({ projectId, userId, addedById }).onConflictDoNothing();
}

/**
 * Removes a member and revokes the widget sessions that were issued to them
 * for this project so the change takes effect immediately.
 */
export async function removeProjectMember(projectId: string, userId: string): Promise<boolean> {
	const deleted = await db
		.delete(projectMembers)
		.where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
		.returning({ userId: projectMembers.userId });
	await db
		.delete(sessions)
		.where(and(eq(sessions.userId, userId), eq(sessions.kind, 'widget'), eq(sessions.projectId, projectId)));
	return deleted.length > 0;
}

/** Projects a member belongs to (used for the member's dashboard home). */
export async function listProjectsForMember(userId: string): Promise<Project[]> {
	const rows = await db
		.select({ project: projects })
		.from(projectMembers)
		.innerJoin(projects, eq(projects.id, projectMembers.projectId))
		.where(eq(projectMembers.userId, userId))
		.orderBy(asc(projects.name));
	return rows.map((r) => r.project);
}

/**
 * Central access rule for signed-in users on a project. Owners and admins
 * always have access. Members have access when they were added to the project
 * or when the project is open for signups, in which case they are added on
 * first access. Returns false when the user may not use this project.
 */
export async function ensureProjectAccess(user: User, project: Project): Promise<boolean> {
	if (isAdminRole(user.role)) return true;
	if (await isProjectMember(project.id, user.id)) return true;
	if (project.openSignups) {
		await addProjectMember(project.id, user.id, null);
		return true;
	}
	return false;
}
