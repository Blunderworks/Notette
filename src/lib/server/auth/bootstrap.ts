import { config } from '$lib/server/env';
import { countUsers, createUser, getUserByEmail } from '$lib/server/services/users';

/**
 * Creates the initial admin account from NOTETTE_ADMIN_EMAIL/PASSWORD if that
 * user does not exist yet. Never modifies existing accounts.
 */
export async function ensureBootstrapAdmin(): Promise<void> {
	const email = config.adminEmail;
	const password = config.adminPassword;
	if (!email || !password) return;

	const existing = await getUserByEmail(email);
	if (existing) return;

	if (password.length < 10) {
		console.warn('[notette] NOTETTE_ADMIN_PASSWORD must be at least 10 characters; skipping bootstrap admin.');
		return;
	}

	const total = await countUsers();
	await createUser({
		email,
		name: config.adminName,
		password,
		role: total === 0 ? 'owner' : 'admin'
	});
	console.log(`[notette] Created admin account ${email}`);
}
