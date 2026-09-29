/**
 * Element locators are supplied by reviewers and evaluated in other reviewers'
 * browsers, so only the shapes the widget itself generates (see
 * `src/widget/lib/dom.ts`) are accepted. Arbitrary XPath or CSS can be made
 * expensive enough to freeze the host page.
 */

/** Absolute element path: `/html/body[1]/main[1]/button[2]`. */
const XPATH_RE = /^\/html(?:\/[a-z][a-z0-9._\-\u00b7\u00c0-\uffff]*\[\d{1,5}\])+$/;

export function isSafeXPath(value: string): boolean {
	return value.length <= 1000 && XPATH_RE.test(value);
}

/**
 * Ids, tags, classes, test-id attribute selectors and `:nth-of-type(n)`,
 * joined only by child combinators. Functional pseudo-classes (`:has`, `:not`,
 * …), descendant or sibling combinators and selector lists are rejected.
 */
export function isSafeSelector(value: string): boolean {
	if (value.length > 1000) return false;
	const rest = value
		.replace(/"(?:[^"\\]|\\.)*"/g, '""')
		.replace(/\\[0-9a-fA-F]{1,6} ?/g, 'x')
		.replace(/\\./g, 'x')
		.replace(/:nth-of-type\(\d{1,5}\)/g, '');
	if (/[:()~+,*|^$"'\\]/.test(rest.replace(/=""\]/g, ']'))) return false;
	return rest.split(' > ').every((part) => part.length > 0 && !/\s/.test(part));
}
