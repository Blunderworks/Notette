const BASE = 'http://notette.invalid';

/**
 * Only allows same-site relative paths as post-login redirect targets.
 * Rejects control characters and whitespace outright (browsers strip tabs and
 * newlines, so `/\t/evil.com` would become `//evil.com`), then resolves the
 * path the way a browser would and requires it to stay on this origin.
 */
export function safeRedirectTarget(raw: string | null | undefined, fallback = '/'): string {
	if (!raw || !raw.startsWith('/') || /[\s\x00-\x1f\x7f\\]/.test(raw)) return fallback;
	let url: URL;
	try {
		url = new URL(raw, BASE);
	} catch {
		return fallback;
	}
	if (url.origin !== BASE) return fallback;
	return url.pathname + url.search + url.hash;
}
