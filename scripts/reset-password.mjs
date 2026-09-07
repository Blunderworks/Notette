#!/usr/bin/env node
/**
 * Resets a dashboard user's password (or creates the user if missing).
 *
 *   node scripts/reset-password.mjs <email> <new-password>
 *   docker compose exec app node scripts/reset-password.mjs admin@example.com 'new-password'
 *
 * Uses DATABASE_URL. The hash format matches src/lib/server/auth/password.ts.
 */
import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import postgres from 'postgres';

const scrypt = promisify(scryptCallback);

async function hashPassword(password) {
	const salt = randomBytes(16);
	const key = await scrypt(password.normalize('NFKC'), salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
	return ['scrypt', 16384, 8, 1, salt.toString('base64'), key.toString('base64')].join('$');
}

const [email, password] = process.argv.slice(2);
if (!email || !password) {
	console.error('Usage: node scripts/reset-password.mjs <email> <new-password>');
	process.exit(1);
}
if (password.length < 10) {
	console.error('Password must be at least 10 characters.');
	process.exit(1);
}
if (!process.env.DATABASE_URL) {
	console.error('DATABASE_URL is not set.');
	process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
try {
	const normalized = email.trim().toLowerCase();
	const passwordHash = await hashPassword(password);
	const updated = await sql`
		update users set password_hash = ${passwordHash}, updated_at = now()
		where email = ${normalized} returning id`;
	if (updated.length > 0) {
		await sql`delete from sessions where user_id = ${updated[0].id}`;
		console.log(`Password updated for ${normalized}; all sessions signed out.`);
	} else {
		const [{ count }] = await sql`select count(*)::int as count from users`;
		const role = count === 0 ? 'owner' : 'admin';
		await sql`insert into users (email, name, password_hash, role) values (${normalized}, ${normalized.split('@')[0]}, ${passwordHash}, ${role})`;
		console.log(`Created ${role} account ${normalized}.`);
	}
} finally {
	await sql.end();
}
