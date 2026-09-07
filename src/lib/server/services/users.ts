import { asc, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users, type User } from '$lib/server/db/schema';
import { hashPassword } from '$lib/server/auth/password';
import { ApiError } from '$lib/server/http';

export type UserRole = 'owner' | 'admin';

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
}): Promise<User> {
	const email = input.email.trim().toLowerCase();
	if (await getUserByEmail(email)) {
		throw new ApiError(409, 'A user with this email already exists', 'user_exists');
	}
	const passwordHash = await hashPassword(input.password);
	const [row] = await db
		.insert(users)
		.values({ email, name: input.name.trim(), passwordHash, role: input.role })
		.returning();
	return row;
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

export async function countOwners(): Promise<number> {
	const [row] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(users)
		.where(eq(users.role, 'owner'));
	return row?.count ?? 0;
}
