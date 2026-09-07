/**
 * Origin normalization and allow-list matching for per-project CORS.
 *
 * Allowed origin entries are of the form `scheme://host[:port]`. A `*` may be
 * used as a wildcard for part of the host or port (e.g. `https://*.vercel.app`,
 * `http://localhost:*`). A lone `*` allows every origin.
 */

const ORIGIN_RE = /^(https?):\/\/([a-z0-9.*_-]+|\[[0-9a-f:.]+\])(:(\d{1,5}|\*))?$/i;

export function normalizeOrigin(input: string): string | null {
	const trimmed = input.trim();
	if (!trimmed) return null;
	try {
		const url = new URL(trimmed);
		if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
		return url.origin.toLowerCase();
	} catch {
		return null;
	}
}

/**
 * Normalizes a user-provided allow-list entry. Returns null when the entry is
 * not a valid origin or origin pattern.
 */
export function normalizeOriginPattern(input: string): string | null {
	let value = input.trim().toLowerCase();
	if (!value) return null;
	if (value === '*') return '*';
	if (!/^https?:\/\//.test(value)) value = `https://${value}`;
	// Strip any path, query or fragment.
	value = value.replace(/^(https?:\/\/[^/?#]+).*$/, '$1');
	if (!value.includes('*')) {
		return normalizeOrigin(value);
	}
	if (!ORIGIN_RE.test(value)) return null;
	// Remove a redundant default port.
	value = value.replace(/^(https):\/\/([^:]+):443$/, '$1://$2').replace(/^(http):\/\/([^:]+):80$/, '$1://$2');
	return value;
}

export function parseAllowedOrigins(text: string): { origins: string[]; invalid: string[] } {
	const origins: string[] = [];
	const invalid: string[] = [];
	for (const raw of text.split(/[\n,]/)) {
		const trimmed = raw.trim();
		if (!trimmed) continue;
		const normalized = normalizeOriginPattern(trimmed);
		if (!normalized) invalid.push(trimmed);
		else if (!origins.includes(normalized)) origins.push(normalized);
	}
	return { origins, invalid };
}

function escapeRegExp(value: string): string {
	return value.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}

export function originMatches(origin: string, pattern: string): boolean {
	if (pattern === '*') return true;
	if (!pattern.includes('*')) return origin === pattern;
	const re = new RegExp(`^${escapeRegExp(pattern).replace(/\*/g, '[^/]*')}$`, 'i');
	return re.test(origin);
}

export function isOriginAllowed(origin: string | null, patterns: readonly string[]): boolean {
	if (!origin) return false;
	const normalized = normalizeOrigin(origin);
	if (!normalized) return false;
	return patterns.some((p) => originMatches(normalized, p));
}

/**
 * Determines the origin of a request. Cross-origin fetches always carry an
 * Origin header; same-origin GET requests may not, in which case the Referer
 * is used as a fallback.
 */
export function getRequestOrigin(request: Request): string | null {
	const origin = request.headers.get('origin');
	if (origin && origin !== 'null') return normalizeOrigin(origin);
	const referer = request.headers.get('referer');
	if (referer) return normalizeOrigin(referer);
	return null;
}
