import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { config } from '$lib/server/env';

const CONNECT_ATTEMPTS = 30;
const CONNECT_RETRY_MS = 2000;

function isConnectionError(err: unknown): boolean {
	const code = (err as { code?: string })?.code ?? '';
	return ['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'CONNECT_TIMEOUT', '57P03'].includes(code);
}

/**
 * Waits for the database to accept connections. In Docker the app container
 * may start before PostgreSQL finishes initialising.
 */
async function waitForDatabase(): Promise<void> {
	for (let attempt = 1; attempt <= CONNECT_ATTEMPTS; attempt++) {
		const client = postgres(config.databaseUrl, { max: 1, connect_timeout: 5, onnotice: () => {} });
		try {
			await client`select 1`;
			return;
		} catch (err) {
			if (!isConnectionError(err) || attempt === CONNECT_ATTEMPTS) throw err;
			console.log(`[notette] Database not ready (attempt ${attempt}/${CONNECT_ATTEMPTS}), retrying…`);
			await new Promise((resolve) => setTimeout(resolve, CONNECT_RETRY_MS));
		} finally {
			await client.end({ timeout: 5 }).catch(() => {});
		}
	}
}

/**
 * Applies pending SQL migrations from the drizzle/ folder. Uses a dedicated
 * single connection so it can run before the pooled client is used.
 */
export async function runMigrations(): Promise<void> {
	await waitForDatabase();
	const client = postgres(config.databaseUrl, { max: 1, onnotice: () => {} });
	try {
		await migrate(drizzle(client), { migrationsFolder: config.migrationsDir });
	} finally {
		await client.end({ timeout: 5 });
	}
}
