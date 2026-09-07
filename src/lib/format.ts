const units: [Intl.RelativeTimeFormatUnit, number][] = [
	['year', 365 * 24 * 60 * 60],
	['month', 30 * 24 * 60 * 60],
	['week', 7 * 24 * 60 * 60],
	['day', 24 * 60 * 60],
	['hour', 60 * 60],
	['minute', 60]
];

const rtf = typeof Intl !== 'undefined' ? new Intl.RelativeTimeFormat('en', { numeric: 'auto' }) : null;

export function timeAgo(input: string | Date | null | undefined): string {
	if (!input) return '';
	const date = typeof input === 'string' ? new Date(input) : input;
	const seconds = Math.round((date.getTime() - Date.now()) / 1000);
	if (Math.abs(seconds) < 45) return 'just now';
	for (const [unit, size] of units) {
		if (Math.abs(seconds) >= size) {
			const value = Math.round(seconds / size);
			return rtf ? rtf.format(value, unit) : `${Math.abs(value)} ${unit}s ago`;
		}
	}
	return rtf ? rtf.format(Math.round(seconds / 60), 'minute') : 'a moment ago';
}

export function formatDateTime(input: string | Date | null | undefined): string {
	if (!input) return '';
	const date = typeof input === 'string' ? new Date(input) : input;
	return date.toLocaleString(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});
}

export function truncate(text: string, max = 140): string {
	const collapsed = text.replace(/\s+/g, ' ').trim();
	return collapsed.length > max ? `${collapsed.slice(0, max - 1)}…` : collapsed;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
	return `${count} ${count === 1 ? singular : plural}`;
}

/** Appends ?notette=<id> to a page URL so the widget focuses that pin on load. */
export function siteLinkForFeedback(url: string, id: string): string {
	try {
		const u = new URL(url);
		u.searchParams.set('notette', id);
		return u.toString();
	} catch {
		return url;
	}
}
