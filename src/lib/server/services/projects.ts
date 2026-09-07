import { desc, eq, getTableColumns, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { feedback, projects, type Project } from '$lib/server/db/schema';
import { generateClientKey } from '$lib/server/ids';
import { deleteFilesForProject } from './uploads';

export interface ProjectWithCounts extends Project {
	openCount: number;
	resolvedCount: number;
	lastFeedbackAt: Date | null;
}

export interface ProjectInput {
	name: string;
	allowedOrigins: string[];
	publicFeedbackVisible: boolean;
	reviewerRepliesEnabled: boolean;
	screenshotsEnabled: boolean;
	anonymousFeedbackAllowed: boolean;
	openSignups: boolean;
}

const openCount = sql<number>`(select count(*)::int from ${feedback} f where f.project_id = ${projects.id} and f.status = 'open')`;
const resolvedCount = sql<number>`(select count(*)::int from ${feedback} f where f.project_id = ${projects.id} and f.status = 'resolved')`;
const lastFeedbackAt = sql<string | null>`(select max(f.created_at) from ${feedback} f where f.project_id = ${projects.id})`;

function withCounts(row: Project & { openCount: number; resolvedCount: number; lastFeedbackAt: string | null }): ProjectWithCounts {
	return {
		...row,
		lastFeedbackAt: row.lastFeedbackAt ? new Date(row.lastFeedbackAt) : null
	};
}

function selectWithCounts() {
	return db.select({ ...getTableColumns(projects), openCount, resolvedCount, lastFeedbackAt }).from(projects);
}

export async function listProjects(): Promise<ProjectWithCounts[]> {
	const rows = await selectWithCounts().orderBy(desc(projects.createdAt));
	return rows.map(withCounts);
}

export async function getProject(id: string): Promise<Project | null> {
	const [row] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
	return row ?? null;
}

export async function getProjectWithCounts(id: string): Promise<ProjectWithCounts | null> {
	const rows = await selectWithCounts().where(eq(projects.id, id)).limit(1);
	return rows[0] ? withCounts(rows[0]) : null;
}

export async function getProjectByClientKey(clientKey: string): Promise<Project | null> {
	if (!clientKey || clientKey.length > 64) return null;
	const [row] = await db.select().from(projects).where(eq(projects.clientKey, clientKey)).limit(1);
	return row ?? null;
}

export async function createProject(input: ProjectInput): Promise<Project> {
	const [row] = await db
		.insert(projects)
		.values({ ...input, clientKey: generateClientKey() })
		.returning();
	return row;
}

export async function updateProject(id: string, patch: Partial<ProjectInput>): Promise<Project | null> {
	const [row] = await db
		.update(projects)
		.set({ ...patch, updatedAt: new Date() })
		.where(eq(projects.id, id))
		.returning();
	return row ?? null;
}

export async function regenerateClientKey(id: string): Promise<Project | null> {
	const [row] = await db
		.update(projects)
		.set({ clientKey: generateClientKey(), updatedAt: new Date() })
		.where(eq(projects.id, id))
		.returning();
	return row ?? null;
}

export async function deleteProject(id: string): Promise<boolean> {
	await deleteFilesForProject(id);
	const deleted = await db.delete(projects).where(eq(projects.id, id)).returning({ id: projects.id });
	return deleted.length > 0;
}
