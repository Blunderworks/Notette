// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { applyFrozenAnimations, freezeAnimations } from './screenshot';

interface FakeAnimation {
	target: Element;
	keyframes: Record<string, unknown>[];
	pseudoElement?: string | null;
	throws?: boolean;
}

function installAnimations(animations: FakeAnimation[]): void {
	(document as unknown as { getAnimations: () => unknown[] }).getAnimations = () =>
		animations.map((a) => ({
			effect: {
				target: a.target,
				pseudoElement: a.pseudoElement ?? null,
				getKeyframes() {
					if (a.throws) throw new Error('not exposed');
					return a.keyframes;
				}
			}
		}));
}

afterEach(() => {
	document.body.innerHTML = '';
	delete (document as unknown as { getAnimations?: unknown }).getAnimations;
});

describe('freezeAnimations', () => {
	it('records the live values of animated properties and tags the elements', () => {
		document.body.innerHTML = `
			<h1 id="hero" style="opacity: 1; transform: none">Hello</h1>
			<div id="static">Still</div>
			<notette-widget><span id="inside" style="opacity: 0.5"></span></notette-widget>`;
		const hero = document.getElementById('hero')!;
		const inside = document.getElementById('inside')!;
		const host = document.querySelector('notette-widget')!;
		installAnimations([
			{ target: hero, keyframes: [{ offset: 0, opacity: '0', transform: 'translateY(20px)' }, { offset: 1, opacity: '1' }] },
			{ target: inside, keyframes: [{ opacity: '0' }] }
		]);

		const frozen = freezeAnimations(document, host);

		expect(frozen.elements).toEqual([hero]);
		expect(hero.hasAttribute('data-notette-frozen')).toBe(true);
		expect(inside.hasAttribute('data-notette-frozen')).toBe(false);
		const values = frozen.styles.get(hero.getAttribute('data-notette-frozen')!)!;
		expect(Object.fromEntries(values)).toEqual({ opacity: '1', transform: 'none' });

		frozen.release();
		expect(hero.hasAttribute('data-notette-frozen')).toBe(false);
	});

	it('falls back to the common properties when keyframes are not exposed', () => {
		document.body.innerHTML = `<p id="p" style="opacity: 0.4; visibility: visible">x</p>`;
		const p = document.getElementById('p')!;
		installAnimations([{ target: p, keyframes: [], throws: true }]);
		const frozen = freezeAnimations(document, null);
		const values = Object.fromEntries(frozen.styles.get('0')!);
		expect(values.opacity).toBe('0.4');
		expect(values.visibility).toBe('visible');
		frozen.release();
	});

	it('skips pseudo-element animations and copes without getAnimations', () => {
		document.body.innerHTML = `<p id="p" style="opacity: 1">x</p>`;
		installAnimations([{ target: document.getElementById('p')!, keyframes: [{ opacity: '0' }], pseudoElement: '::before' }]);
		expect(freezeAnimations(document, null).elements).toEqual([]);
		delete (document as unknown as { getAnimations?: unknown }).getAnimations;
		expect(freezeAnimations(document, null).elements).toEqual([]);
	});
});

describe('applyFrozenAnimations', () => {
	it('pins the recorded values on the clone and stops its animations', () => {
		document.body.innerHTML = `<h1 id="hero" style="opacity: 1">Hello</h1>`;
		const hero = document.getElementById('hero')!;
		installAnimations([{ target: hero, keyframes: [{ opacity: '0' }, { opacity: '1' }] }]);
		const frozen = freezeAnimations(document, null);

		const clone = document.implementation.createHTMLDocument('clone');
		clone.body.innerHTML = document.body.innerHTML;
		frozen.release();
		applyFrozenAnimations(clone, frozen);

		const cloned = clone.getElementById('hero')!;
		expect(cloned.hasAttribute('data-notette-frozen')).toBe(false);
		expect(cloned.style.getPropertyValue('opacity')).toBe('1');
		expect(cloned.style.getPropertyPriority('opacity')).toBe('important');
		expect(cloned.style.getPropertyValue('animation')).toBe('none');
		expect(cloned.style.getPropertyValue('transition')).toBe('none');
	});
});
