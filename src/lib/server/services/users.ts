import { asc, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users, type User } from '$lib/server/db/schema';
import { hashPassword } from '$lib/server/auth/password';
import { ApiError } from '$lib/server/http';
import { isAdminRole, type UserRole } from '$lib/shared/roles';
import type { WidgetViewerDto } from '$lib/shared/types';

export type { UserRole } from '$lib/shared/roles';

export async function countUsers(): Promise<number> {
	const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
	return row?.count ?? 0;
}

export async function getUserByEmail(email: string): Promise<User | null> {
	const [row] = await db
		.select()
		.from(users)
		.where(eq(users.email, email.trim().toLowerCase()))
		.limit(1);
	return row ?? null;
}

export async function getUserById(id: string): Promise<User | null> {
	const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
	return row ?? null;
}

export async function listUsers(): Promise<User[]> {
	return db.select().from(users).orderBy(asc(users.createdAt));
}

export async function createUser(input: {
	email: string;
	name: string;
	password: string;
	role: UserRole;
	/** False for widget sign-ups that must confirm their address first (default true). */
	verified?: boolean;
}): Promise<User> {
	const email = input.email.trim().toLowerCase();
	if (await getUserByEmail(email)) {
		throw new ApiError(409, 'A user with this email already exists', 'user_exists');
	}
	const passwordHash = await hashPassword(input.password);
	const [row] = await db
		.insert(users)
		.values({
			email,
			name: input.name.trim(),
			passwordHash,
			role: input.role,
			emailVerifiedAt: input.verified === false ? null : new Date()
		})
		.returning();
	return row;
}

export async function markEmailVerified(id: string): Promise<void> {
	await db.update(users).set({ emailVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, id));
}

export async function updateUserProfile(id: string, patch: { name?: string; role?: UserRole }): Promise<User | null> {
	const [row] = await db
		.update(users)
		.set({ ...patch, updatedAt: new Date() })
		.where(eq(users.id, id))
		.returning();
	return row ?? null;
}

export async function setUserPassword(id: string, password: string): Promise<void> {
	const passwordHash = await hashPassword(password);
	await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, id));
}

export async function deleteUser(id: string): Promise<boolean> {
	const deleted = await db.delete(users).where(eq(users.id, id)).returning({ id: users.id });
	return deleted.length > 0;
}

/** Viewer identity returned to the widget after sign-in or on config load. */
export function toViewerDto(user: User): WidgetViewerDto {
	return { admin: isAdminRole(user.role), role: user.role, name: user.name, email: user.email, emailNotifications: true };
}

export async function countOwners(): Promise<number> {
	const [row] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(users)
		.where(eq(users.role, 'owner'));
	return row?.count ?? 0;
}
