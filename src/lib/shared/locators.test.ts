import { describe, expect, it } from 'vitest';
import { isSafeSelector, isSafeXPath } from './locators';

describe('isSafeXPath', () => {
	it('accepts generated absolute paths', () => {
		expect(isSafeXPath('/html/body[1]')).toBe(true);
		expect(isSafeXPath('/html/body[1]/main[1]/my-widget[2]/button[3]')).toBe(true);
	});

	it('rejects expressions that could be expensive or match anything', () => {
		for (const xpath of ['//*[count(//*[count(//*)=0])=0]', '/html/body[1]//div[1]', '/html/*[1]', '/html/body[last()]', '/html/body', '/html/', 'id("x")']) {
			expect(isSafeXPath(xpath), xpath).toBe(false);
		}
	});
});

describe('isSafeSelector', () => {
	it('accepts the shapes the widget generates', () => {
		for (const selector of [
			'body',
			'#checkout',
			'main > section.hero.dark > button:nth-of-type(2)',
			'div[data-testid="save \\"now\\" (a:b)"] > span',
			'#app > div.\\32 col > p:nth-of-type(10)',
			'body > div:nth-of-type(3) > ul:nth-of-type(1) > li:nth-of-type(4)'
		]) {
			expect(isSafeSelector(selector), selector).toBe(true);
		}
	});

	it('rejects functional pseudo-classes, other combinators and lists', () => {
		for (const selector of [
			'div:has(span)',
			':not(:not(*))',
			'div span',
			'div ~ p',
			'div + p',
			'div, p',
			'*',
			'li:nth-child(2n of .x)',
			'a[href^="x"]',
			'div > ',
			'div:is(p)'
		]) {
			expect(isSafeSelector(selector), selector).toBe(false);
		}
	});
});
