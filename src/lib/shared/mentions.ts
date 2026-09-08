/**
 * @-mention helpers shared by the widget, the dashboard and the server. This
 * file must stay free of server-only and framework-specific imports.
 *
 * Mentions are stored as `@Display Name` in the text plus a structured list of
 * `{ id, name }` references. The text is what people read; the references are
 * what the server validates and notifies.
 */

import type { MentionCandidateDto, MentionRef } from './types';

export type { MentionCandidateDto, MentionRef } from './types';

/** Longest query (characters after the `@`) that still opens the picker. */
const MAX_QUERY_LENGTH = 40;
/** A display name can contain spaces; stop looking once the query spans more words than any name would. */
const MAX_QUERY_WORDS = 3;

export interface MentionQuery {
	/** Index of the `@` in the text. */
	start: number;
	/** Text between the `@` and the caret. */
	query: string;
}

/**
 * Finds an `@query` token that ends at the caret, or null when the caret is
 * not inside one. The `@` must start the text or follow whitespace or an
 * opening bracket so email addresses do not trigger the picker.
 */
export function findMentionQuery(text: string, caret: number): MentionQuery | null {
	const before = text.slice(0, Math.max(0, Math.min(caret, text.length)));
	const at = before.lastIndexOf('@');
	if (at < 0) return null;
	if (at > 0 && !/[\s([{]/.test(before[at - 1])) return null;
	const query = before.slice(at + 1);
	if (query.length > MAX_QUERY_LENGTH) return null;
	if (/[\r\n]/.test(query)) return null;
	if (query.trim().split(/\s+/).length > MAX_QUERY_WORDS) return null;
	return { start: at, query };
}

/** Candidates whose name matches the query, prefix matches first, at most `limit`. */
export function filterMentionCandidates<T extends MentionCandidateDto>(
	candidates: readonly T[],
	query: string,
	limit = 8
): T[] {
	const q = query.trim().toLowerCase();
	const scored = candidates
		.map((candidate) => {
			const name = candidate.name.toLowerCase();
			let score = -1;
			if (!q) score = 1;
			else if (name.startsWith(q)) score = 3;
			else if (name.split(/\s+/).some((word) => word.startsWith(q))) score = 2;
			else if (name.includes(q)) score = 1;
			return { candidate, score };
		})
		.filter((entry) => entry.score > 0)
		.sort((a, b) => b.score - a.score || a.candidate.name.localeCompare(b.candidate.name));
	return scored.slice(0, limit).map((entry) => entry.candidate);
}

/** Replaces the `@query` at `start..caret` with `@Name ` and returns the new caret position. */
export function insertMention(
	text: string,
	start: number,
	caret: number,
	candidate: MentionRef
): { text: string; caret: number } {
	const insert = `@${candidate.name} `;
	return {
		text: text.slice(0, start) + insert + text.slice(Math.max(caret, start)),
		caret: start + insert.length
	};
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Regex matching `@Name` for any of the names, longest names first so "Jo" never shadows "Jo Ann". */
function mentionPattern(names: readonly string[]): RegExp | null {
	const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
	if (!unique.length) return null;
	// A mention ends at the end of the text or before a character that cannot continue a name.
	return new RegExp(`@(${unique.map(escapeRegExp).join('|')})(?![\\p{L}\\p{N}_])`, 'giu');
}

/** True when `@name` still appears in the text (case-insensitive). */
export function containsMention(text: string, name: string): boolean {
	const re = mentionPattern([name]);
	return !!re && re.test(text);
}

/**
 * Mentions that were inserted through the picker and whose `@Name` is still
 * present in the text. Removing the text removes the mention; duplicates are
 * collapsed. Names are matched together, longest first, so "@Jo Ann" does
 * not also count as a mention of "Jo".
 */
export function activeMentions(text: string, tracked: readonly MentionRef[]): MentionRef[] {
	const re = mentionPattern(tracked.map((m) => m.name));
	if (!re) return [];
	const found = new Set<string>();
	for (const match of text.matchAll(re)) found.add(match[1].toLowerCase());
	const seen = new Set<string>();
	return tracked.filter((mention) => {
		if (seen.has(mention.id) || !found.has(mention.name.trim().toLowerCase())) return false;
		seen.add(mention.id);
		return true;
	});
}

export interface MentionSegment {
	text: string;
	mention: boolean;
}

/** Splits text into plain and mention segments so renderers can highlight `@Name`. */
export function segmentMentions(text: string, names: readonly string[]): MentionSegment[] {
	const re = mentionPattern(names);
	if (!re || !text) return [{ text, mention: false }];
	const segments: MentionSegment[] = [];
	let last = 0;
	for (const match of text.matchAll(re)) {
		const index = match.index ?? 0;
		if (index > last) segments.push({ text: text.slice(last, index), mention: false });
		segments.push({ text: match[0], mention: true });
		last = index + match[0].length;
	}
	if (last < text.length) segments.push({ text: text.slice(last), mention: false });
	return segments.length ? segments : [{ text, mention: false }];
}

/** Parses the comma-separated id list a dashboard form submits. */
export function parseMentionIds(raw: string | null | undefined, max = 20): string[] {
	if (!raw) return [];
	const ids = raw
		.split(',')
		.map((v) => v.trim())
		.filter(Boolean);
	return [...new Set(ids)].slice(0, max);
}
