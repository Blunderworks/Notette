/** Defensive wrappers around web storage (throws in some privacy modes). */

export function readLocal<T>(key: string, fallback: T): T {
	try {
		const raw = localStorage.getItem(key);
		return raw === null ? fallback : (JSON.parse(raw) as T);
	} catch {
		return fallback;
	}
}

export function writeLocal(key: string, value: unknown): void {
	try {
		if (value === null || value === undefined) localStorage.removeItem(key);
		else localStorage.setItem(key, JSON.stringify(value));
	} catch {
		/* ignore */
	}
}

export function readSession(key: string): string | null {
	try {
		return sessionStorage.getItem(key);
	} catch {
		return null;
	}
}

export function writeSession(key: string, value: string | null): void {
	try {
		if (value === null) sessionStorage.removeItem(key);
		else sessionStorage.setItem(key, value);
	} catch {
		/* ignore */
	}
}
