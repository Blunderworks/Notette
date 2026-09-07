// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { computeSelector, computeXPath, describeElement, elementLabel, locateElement } from './dom';

function render(html: string): void {
	document.body.innerHTML = html;
}

describe('computeSelector', () => {
	beforeEach(() => render(''));

	it('prefers unique ids', () => {
		render('<main><button id="save">Save</button></main>');
		const el = document.getElementById('save')!;
		expect(computeSelector(el)).toBe('#save');
	});

	it('uses test ids when present', () => {
		render('<div><button data-testid="submit-btn" class="css-1x2y3z4">Go</button></div>');
		const el = document.querySelector('button')!;
		expect(computeSelector(el)).toBe('button[data-testid="submit-btn"]');
	});

	it('skips generated-looking classes and disambiguates siblings', () => {
		render(`
			<section class="pricing">
				<div class="plan svelte-1abc2de"><button class="btn">A</button></div>
				<div class="plan"><button class="btn">B</button></div>
			</section>`);
		const second = document.querySelectorAll('button')[1];
		const selector = computeSelector(second)!;
		expect(selector).not.toContain('svelte-');
		expect(document.querySelector(selector)).toBe(second);
	});

	it('always produces a selector that resolves back to the element', () => {
		render(`
			<div><ul><li>1</li><li>2</li><li><span>x</span><span>y</span></li></ul></div>
			<div><ul><li>a</li></ul></div>`);
		for (const el of Array.from(document.querySelectorAll('li, span'))) {
			const selector = computeSelector(el);
			expect(selector).toBeTruthy();
			expect(document.querySelector(selector!)).toBe(el);
		}
	});
});

describe('computeXPath and locateElement', () => {
	it('round-trips through xpath when the selector is unavailable', () => {
		render('<div><p>one</p><p>two</p></div>');
		const second = document.querySelectorAll('p')[1];
		const xpath = computeXPath(second);
		expect(xpath).toBe('/html/body[1]/div[1]/p[2]');
		expect(locateElement({ elementSelector: null, elementXpath: xpath, elementTag: 'p', elementText: 'two' })).toBe(second);
	});

	it('uses text to disambiguate selectors that match several elements', () => {
		render('<nav><a class="link">Home</a><a class="link">Docs</a></nav>');
		const docs = document.querySelectorAll('a')[1];
		expect(locateElement({ elementSelector: 'a.link', elementXpath: null, elementTag: 'a', elementText: 'Docs' })).toBe(docs);
	});

	it('returns null when nothing matches', () => {
		render('<div></div>');
		expect(locateElement({ elementSelector: '#missing', elementXpath: '/html/body[1]/span[1]', elementTag: 'span', elementText: null })).toBeNull();
	});
});

describe('describeElement / elementLabel', () => {
	it('captures attributes and text but not input values', () => {
		render('<input id="email" type="email" placeholder="you@example.com" value="secret@example.com" />');
		const el = document.querySelector('input')!;
		const info = describeElement(el);
		expect(info.tag).toBe('input');
		expect(info.text).toBe('you@example.com');
		expect(info.attributes.type).toBe('email');
		expect(JSON.stringify(info)).not.toContain('secret@');
		expect(elementLabel(el)).toBe('input#email "you@example.com"');
	});
});
