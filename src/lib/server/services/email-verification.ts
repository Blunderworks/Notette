import { desc, eq, lt } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { emailVerifications, users, type User } from '$lib/server/db/schema';
import { renderVerificationEmail } from '$lib/server/email/templates';
import { sendEmail } from '$lib/server/email/mailer';
import { randomToken, sha256 } from '$lib/server/ids';
import { getUserByEmail } from './users';

/** How long a confirmation link stays valid. */
const VERIFICATION_TTL_HOURS = 24;

/** Creates a fresh single-use token for the user, replacing any older ones. */
export async function issueVerificationToken(userId: string, origin: string | null): Promise<string> {
	const token = randomToken(32, 'ntv_');
	await db.transaction(async (tx) => {
		await tx.delete(emailVerifications).where(eq(emailVerifications.userId, userId));
		await tx.insert(emailVerifications).values({
			tokenHash: sha256(token),
			userId,
			origin,
			expiresAt: new Date(Date.now() + VERIFICATION_TTL_HOURS * 60 * 60 * 1000)
		});
	});
	return token;
}

export function verificationLink(baseUrl: string, token: string): string {
	return `${baseUrl}/verify-email?token=${encodeURIComponent(token)}`;
}

/** Issues a token and emails the confirmation link. Throws when the email cannot be sent. */
export async function sendVerificationEmail(user: User, origin: string | null, baseUrl: string): Promise<void> {
	const token = await issueVerificationToken(user.id, origin);
	const email = renderVerificationEmail({
		name: user.name,
		link: verificationLink(baseUrl, token),
		origin,
		expiresHours: VERIFICATION_TTL_HOURS
	});
	await sendEmail({ to: user.email, ...email });
}

export type VerifyEmailResult =
	| { status: 'verified' | 'already_verified'; name: string; origin: string | null }
	| { status: 'invalid' | 'expired' };

/** Consumes a confirmation link. Every outcome deletes the token. */
export async function verifyEmailToken(raw: string | null | undefined): Promise<VerifyEmailResult> {
	if (!raw || raw.length < 20 || raw.length > 200) return { status: 'invalid' };
	const tokenHash = sha256(raw);
	const [row] = await db
		.select({ verification: emailVerifications, user: users })
		.from(emailVerifications)
		.innerJoin(users, eq(users.id, emailVerifications.userId))
		.where(eq(emailVerifications.tokenHash, tokenHash))
		.limit(1);
	if (!row) return { status: 'invalid' };
	if (row.verification.expiresAt.getTime() <= Date.now()) {
		await db.delete(emailVerifications).where(eq(emailVerifications.tokenHash, tokenHash));
		return { status: 'expired' };
	}
	await db.transaction(async (tx) => {
		if (!row.user.emailVerifiedAt) {
			await tx.update(users).set({ emailVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, row.user.id));
		}
		await tx.delete(emailVerifications).where(eq(emailVerifications.userId, row.user.id));
	});
	return {
		status: row.user.emailVerifiedAt ? 'already_verified' : 'verified',
		name: row.user.name,
		origin: row.verification.origin
	};
}

/**
 * Sends a new link to an unverified account. Silently does nothing for
 * unknown or already verified addresses so the endpoint does not reveal
 * which emails have accounts.
 */
export async function resendVerificationEmail(email: string, baseUrl: string): Promise<void> {
	const user = await getUserByEmail(email);
	if (!user || user.emailVerifiedAt) return;
	const [latest] = await db
		.select({ origin: emailVerifications.origin })
		.from(emailVerifications)
		.where(eq(emailVerifications.userId, user.id))
		.orderBy(desc(emailVerifications.createdAt))
		.limit(1);
	await sendVerificationEmail(user, latest?.origin ?? null, baseUrl);
}

export async function deleteExpiredVerifications(): Promise<number> {
	const deleted = await db
		.delete(emailVerifications)
		.where(lt(emailVerifications.expiresAt, new Date()))
		.returning({ tokenHash: emailVerifications.tokenHash });
	return deleted.length;
}
