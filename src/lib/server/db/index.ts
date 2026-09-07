import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { config } from '$lib/server/env';
import * as schema from './schema';

function createDb() {
	const client = postgres(config.databaseUrl, {
		max: 10,
		idle_timeout: 30,
		connect_timeout: 15,
		onnotice: () => {}
	});
	return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;

let instance: Db | null = null;

function getDb(): Db {
	if (!instance) instance = createDb();
	return instance;
}

/**
 * Lazily created Drizzle client. Creation is deferred to first use so that
 * importing server modules (e.g. during SvelteKit's build-time route analysis)
 * does not require DATABASE_URL to be set.
 */
export const db: Db = new Proxy({} as Db, {
	get(_target, prop, _receiver) {
		const real = getDb() as unknown as Record<PropertyKey, unknown>;
		const value = real[prop];
		return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(real) : value;
	}
});

export { schema };
