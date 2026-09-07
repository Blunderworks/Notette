import { env } from '$env/dynamic/private';

function readInt(name: string, fallback: number): number {
	const raw = env[name];
	if (!raw) return fallback;
	const value = Number.parseInt(raw, 10);
	return Number.isFinite(value) && value > 0 ? value : fallback;
}

function readBool(name: string, fallback: boolean): boolean {
	const raw = env[name];
	if (raw === undefined || raw === '') return fallback;
	return !['0', 'false', 'no', 'off'].includes(raw.trim().toLowerCase());
}

function normalizeUrl(raw: string | undefined): string | null {
	if (!raw) return null;
	try {
		const url = new URL(raw);
		return url.origin + url.pathname.replace(/\/+$/, '');
	} catch {
		return null;
	}
}

/**
 * Runtime configuration. Everything is read lazily from process env so that a
 * single container image can be configured at start time.
 */
export const config = {
	get databaseUrl(): string {
		const url = env.DATABASE_URL;
		if (!url) throw new Error('DATABASE_URL is not set');
		return url;
	},
	/** Public base URL of this instance without trailing slash, if configured. */
	get publicUrl(): string | null {
		return normalizeUrl(env.NOTETTE_URL ?? env.ORIGIN);
	},
	get uploadsDir(): string {
		return env.NOTETTE_UPLOADS_DIR || './data/uploads';
	},
	get migrationsDir(): string {
		return env.NOTETTE_MIGRATIONS_DIR || './drizzle';
	},
	get autoMigrate(): boolean {
		return readBool('NOTETTE_AUTO_MIGRATE', true);
	},
	get maxScreenshotBytes(): number {
		return readInt('NOTETTE_MAX_SCREENSHOT_BYTES', 8 * 1024 * 1024);
	},
	get sessionDays(): number {
		return readInt('NOTETTE_SESSION_DAYS', 30);
	},
	get adminEmail(): string | null {
		return env.NOTETTE_ADMIN_EMAIL?.trim() || null;
	},
	get adminPassword(): string | null {
		return env.NOTETTE_ADMIN_PASSWORD || null;
	},
	get adminName(): string {
		return env.NOTETTE_ADMIN_NAME?.trim() || 'Admin';
	},
	get isProduction(): boolean {
		return (env.NODE_ENV ?? 'development') === 'production';
	}
};
