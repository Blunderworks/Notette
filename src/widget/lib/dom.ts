import type { ElementRect, FeedbackSummaryDto } from '$lib/shared/types';

const CAPTURED_ATTRIBUTES = [
	'id',
	'class',
	'name',
	'type',
	'role',
	'href',
	'src',
	'alt',
	'title',
	'placeholder',
	'aria-label',
	'for',
	'data-testid',
	'data-test-id',
	'data-test',
	'data-cy',
	'data-qa'
];

const TEST_ID_ATTRIBUTES = ['data-testid', 'data-test-id', 'data-test', 'data-cy', 'data-qa'];

function cssEscape(value: string): string {
	if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
	return value.replace(/([^\w-])/g, '\\$1');
}

/** Heuristic: skip class names that look generated (CSS modules, styled-components, hashes). */
function isStableClass(name: string): boolean {
	if (name.length < 2 || name.length > 48) return false;
	if (/^(svelte-|css-|sc-|jsx-|emotion-|chakra-|MuiBox|_)/.test(name)) return false;
	if (/[0-9a-f]{6,}/i.test(name)) return false;
	if (/[^A-Za-z0-9_-]/.test(name)) return false;
	if (/^[A-Za-z0-9_-]*[0-9]{4,}[A-Za-z0-9_-]*$/.test(name)) return false;
	return true;
}

function stableClasses(el: Element, max = 2): string[] {
	const out: string[] = [];
	for (const name of Array.from(el.classList)) {
		if (isStableClass(name)) out.push(name);
		if (out.length >= max) break;
	}
	return out;
}

function nthOfType(el: Element): number {
	let index = 1;
	let sibling = el.previousElementSibling;
	while (sibling) {
		if (sibling.tagName === el.tagName) index += 1;
		sibling = sibling.previousElementSibling;
	}
	return index;
}

function hasSameTagSiblings(el: Element): boolean {
	const parent = el.parentElement;
	if (!parent) return false;
	for (const child of Array.from(parent.children)) {
		if (child !== el && child.tagName === el.tagName) return true;
	}
	return false;
}

function matchesUnique(selector: string, el: Element): boolean {
	try {
		const found = document.querySelectorAll(selector);
		return found.length === 1 && found[0] === el;
	} catch {
		return false;
	}
}

function segmentFor(el: Element, needsNth: boolean): string {
	const tag = el.tagName.toLowerCase();
	for (const attr of TEST_ID_ATTRIBUTES) {
		const value = el.getAttribute(attr);
		if (value) return `${tag}[${attr}="${value.replace(/"/g, '\\"')}"]`;
	}
	let segment = tag;
	const classes = stableClasses(el);
	if (classes.length) segment += classes.map((c) => `.${cssEscape(c)}`).join('');
	if (needsNth && hasSameTagSiblings(el)) segment += `:nth-of-type(${nthOfType(el)})`;
	return segment;
}

/**
 * Builds a CSS selector that uniquely identifies the element, preferring ids
 * and test ids, then short class-based paths, falling back to nth-of-type paths.
 */
export function computeSelector(el: Element): string | null {
	if (!(el instanceof Element) || el === document.documentElement) return null;
	if (el === document.body) return 'body';

	const id = el.getAttribute('id');
	if (id && /^[A-Za-z][\w-]*$/.test(id) && !/\d{5,}/.test(id)) {
		const selector = `#${cssEscape(id)}`;
		if (matchesUnique(selector, el)) return selector;
	}

	// Attempt progressively longer paths without nth-of-type first, then with.
	for (const useNth of [false, true]) {
		const parts: string[] = [];
		let node: Element | null = el;
		let depth = 0;
		while (node && node !== document.documentElement && depth < 10) {
			const nodeId = node.getAttribute('id');
			if (node !== el && nodeId && /^[A-Za-z][\w-]*$/.test(nodeId) && !/\d{5,}/.test(nodeId)) {
				const anchor = `#${cssEscape(nodeId)}`;
				if (matchesUnique(anchor, node)) {
					parts.unshift(anchor);
					const selector = parts.join(' > ');
					if (matchesUnique(selector, el)) return selector;
					break;
				}
			}
			parts.unshift(segmentFor(node, useNth));
			const selector = parts.join(' > ');
			if (matchesUnique(selector, el)) return selector;
			node = node.parentElement;
			depth += 1;
		}
	}

	// Deterministic fallback: full nth-of-type path from body.
	const parts: string[] = [];
	let node: Element | null = el;
	while (node && node !== document.documentElement) {
		const tag = node.tagName.toLowerCase();
		parts.unshift(node === document.body ? 'body' : `${tag}:nth-of-type(${nthOfType(node)})`);
		node = node.parentElement;
	}
	const selector = parts.join(' > ');
	return matchesUnique(selector, el) ? selector : null;
}

export function computeXPath(el: Element): string {
	const parts: string[] = [];
	let node: Element | null = el;
	while (node && node !== document.documentElement) {
		parts.unshift(`${node.tagName.toLowerCase()}[${nthOfType(node)}]`);
		node = node.parentElement;
	}
	return `/html/${parts.join('/')}`;
}

function collapse(text: string | null | undefined, max: number): string | undefined {
	if (!text) return undefined;
	const collapsed = text.replace(/\s+/g, ' ').trim();
	if (!collapsed) return undefined;
	return collapsed.length > max ? `${collapsed.slice(0, max - 1)}…` : collapsed;
}

export interface ElementDescription {
	tag: string;
	text?: string;
	attributes: Record<string, string>;
}

/** Captures a privacy-conscious description of an element (no input values). */
export function describeElement(el: Element): ElementDescription {
	const attributes: Record<string, string> = {};
	for (const name of CAPTURED_ATTRIBUTES) {
		const value = el.getAttribute(name);
		if (value !== null && value.trim()) attributes[name] = value.trim().slice(0, 300);
	}
	let text: string | undefined;
	if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
		text = collapse(el.placeholder || el.getAttribute('aria-label'), 200);
	} else if (el instanceof HTMLImageElement) {
		text = collapse(el.alt, 200);
	} else {
		text = collapse((el as HTMLElement).innerText ?? el.textContent, 200);
	}
	return { tag: el.tagName.toLowerCase(), text, attributes };
}

/** Short human-readable label such as `button.primary "Save"`. */
export function elementLabel(el: Element): string {
	const tag = el.tagName.toLowerCase();
	let label = tag;
	const id = el.getAttribute('id');
	if (id && /^[A-Za-z][\w-]*$/.test(id)) label += `#${id}`;
	else {
		const classes = stableClasses(el, 1);
		if (classes.length) label += `.${classes[0]}`;
	}
	const description = describeElement(el);
	const text = description.text ? collapse(description.text, 40) : undefined;
	if (text) label += ` "${text}"`;
	return label;
}

export function pageRect(el: Element): ElementRect {
	const r = el.getBoundingClientRect();
	return {
		x: r.left + window.scrollX,
		y: r.top + window.scrollY,
		width: r.width,
		height: r.height
	};
}

export function isRendered(el: Element): boolean {
	if (!el.isConnected) return false;
	const rect = el.getBoundingClientRect();
	if (rect.width === 0 && rect.height === 0) return false;
	const style = window.getComputedStyle(el);
	return style.display !== 'none' && style.visibility !== 'hidden';
}

function evaluateXPath(xpath: string): Element | null {
	try {
		const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
		const node = result.singleNodeValue;
		return node instanceof Element ? node : null;
	} catch {
		return null;
	}
}

function textMatches(el: Element, expected: string | null): boolean {
	if (!expected) return true;
	const actual = collapse((el as HTMLElement).innerText ?? el.textContent, 200) ?? '';
	const probe = expected.replace(/…$/, '').slice(0, 40);
	return actual.includes(probe);
}

/** Finds the element a feedback item was attached to, if it still exists. */
export function locateElement(item: Pick<FeedbackSummaryDto, 'elementSelector' | 'elementXpath' | 'elementTag' | 'elementText'>): Element | null {
	if (item.elementSelector) {
		try {
			const matches = Array.from(document.querySelectorAll(item.elementSelector));
			if (matches.length === 1) return matches[0];
			if (matches.length > 1) {
				return matches.find((m) => textMatches(m, item.elementText)) ?? matches[0];
			}
		} catch {
			/* invalid selector for this document */
		}
	}
	if (item.elementXpath) {
		const el = evaluateXPath(item.elementXpath);
		if (el && (!item.elementTag || el.tagName.toLowerCase() === item.elementTag)) return el;
	}
	return null;
}

export interface PinPosition {
	/** Viewport coordinates. */
	x: number;
	y: number;
	approximate: boolean;
	element: Element | null;
}

/** Computes where a pin should be drawn right now, in viewport coordinates. */
export function pinPosition(item: FeedbackSummaryDto): PinPosition | null {
	const el = locateElement(item);
	if (el && isRendered(el)) {
		const r = el.getBoundingClientRect();
		const relX = item.elementRelX ?? 0.5;
		const relY = item.elementRelY ?? 0.5;
		return {
			x: r.left + r.width * Math.min(Math.max(relX, 0), 1),
			y: r.top + r.height * Math.min(Math.max(relY, 0), 1),
			approximate: false,
			element: el
		};
	}
	if (item.clickX !== null && item.clickY !== null) {
		return { x: item.clickX - window.scrollX, y: item.clickY - window.scrollY, approximate: true, element: null };
	}
	return null;
}
