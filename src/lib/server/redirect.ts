/** Only allows same-site relative paths as post-login redirect targets. */
export function safeRedirectTarget(raw: string | null | undefined, fallback = '/'): string {
	if (!raw) return fallback;
	if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\') || raw.includes('\n')) {
		return fallback;
	}
	return raw;
}
