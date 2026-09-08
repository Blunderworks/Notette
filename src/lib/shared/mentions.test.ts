import { describe, expect, it } from 'vitest';
import {
	activeMentions,
	containsMention,
	filterMentionCandidates,
	findMentionQuery,
	insertMention,
	parseMentionIds,
	segmentMentions
} from './mentions';

const people = [
	{ id: '1', name: 'Jo Ann', admin: true },
	{ id: '2', name: 'Jo', admin: false },
	{ id: '3', name: 'Ada Lovelace', admin: false },
	{ id: '4', name: 'Grace Hopper', admin: true }
];

describe('findMentionQuery', () => {
	it('detects an @ at the start or after whitespace', () => {
		expect(findMentionQuery('@jo', 3)).toEqual({ start: 0, query: 'jo' });
		expect(findMentionQuery('hey @gr', 7)).toEqual({ start: 4, query: 'gr' });
		expect(findMentionQuery('see (@ada', 9)).toEqual({ start: 5, query: 'ada' });
	});
	it('ignores email addresses and text after the caret', () => {
		expect(findMentionQuery('mail me at jo@example.com', 25)).toBeNull();
		expect(findMentionQuery('@jo later', 3)).toEqual({ start: 0, query: 'jo' });
	});
	it('closes on newlines, long queries and too many words', () => {
		expect(findMentionQuery('@jo\nnext', 8)).toBeNull();
		expect(findMentionQuery('@' + 'x'.repeat(41), 42)).toBeNull();
		expect(findMentionQuery('@one two three four', 19)).toBeNull();
		expect(findMentionQuery('@grace hop', 10)).toEqual({ start: 0, query: 'grace hop' });
	});
});

describe('filterMentionCandidates', () => {
	it('lists everyone for an empty query, alphabetically', () => {
		expect(filterMentionCandidates(people, '').map((p) => p.name)).toEqual(['Ada Lovelace', 'Grace Hopper', 'Jo', 'Jo Ann']);
	});
	it('ranks prefix matches before word and substring matches', () => {
		expect(filterMentionCandidates(people, 'jo').map((p) => p.name)).toEqual(['Jo', 'Jo Ann']);
		expect(filterMentionCandidates(people, 'hop').map((p) => p.name)).toEqual(['Grace Hopper']);
		expect(filterMentionCandidates(people, 'lace').map((p) => p.name)).toEqual(['Ada Lovelace']);
		expect(filterMentionCandidates(people, 'zzz')).toEqual([]);
	});
	it('respects the limit', () => {
		expect(filterMentionCandidates(people, '', 2)).toHaveLength(2);
	});
});

describe('insertMention', () => {
	it('replaces the query with the name and a trailing space', () => {
		const result = insertMention('hey @gr there', 4, 7, { id: '4', name: 'Grace Hopper' });
		expect(result.text).toBe('hey @Grace Hopper  there');
		expect(result.caret).toBe('hey @Grace Hopper '.length);
	});
});

describe('containsMention / activeMentions', () => {
	it('matches whole names only, case-insensitively', () => {
		expect(containsMention('cc @Jo Ann please', 'Jo Ann')).toBe(true);
		expect(containsMention('cc @jo ann please', 'Jo Ann')).toBe(true);
		expect(containsMention('cc @Joanna please', 'Jo')).toBe(false);
		expect(containsMention('cc @Jo, thanks', 'Jo')).toBe(true);
	});
	it('drops mentions whose text was deleted and collapses duplicates', () => {
		const tracked = [
			{ id: '1', name: 'Jo Ann' },
			{ id: '2', name: 'Jo' },
			{ id: '1', name: 'Jo Ann' }
		];
		expect(activeMentions('ping @Jo Ann and @Jo Ann', tracked)).toEqual([{ id: '1', name: 'Jo Ann' }]);
		expect(activeMentions('nobody here', tracked)).toEqual([]);
	});
});

describe('segmentMentions', () => {
	it('highlights the longest matching name and leaves other text alone', () => {
		expect(segmentMentions('hi @Jo Ann and @Jo!', ['Jo', 'Jo Ann'])).toEqual([
			{ text: 'hi ', mention: false },
			{ text: '@Jo Ann', mention: true },
			{ text: ' and ', mention: false },
			{ text: '@Jo', mention: true },
			{ text: '!', mention: false }
		]);
	});
	it('returns the text unchanged without names', () => {
		expect(segmentMentions('plain', [])).toEqual([{ text: 'plain', mention: false }]);
		expect(segmentMentions('', ['Jo'])).toEqual([{ text: '', mention: false }]);
	});
	it('escapes regex characters in names', () => {
		expect(segmentMentions('@A.B (test)', ['A.B (test)'])).toEqual([{ text: '@A.B (test)', mention: true }]);
	});
});

describe('parseMentionIds', () => {
	it('splits, trims, dedupes and caps', () => {
		expect(parseMentionIds(' a, b ,a,,c ')).toEqual(['a', 'b', 'c']);
		expect(parseMentionIds(null)).toEqual([]);
		expect(parseMentionIds('a,b,c', 2)).toEqual(['a', 'b']);
	});
});
