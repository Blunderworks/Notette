// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { ISOLATED_EVENTS, isolateHostEvents } from './isolate';

function setup() {
	const host = document.createElement('notette-widget');
	const shadow = host.attachShadow({ mode: 'open' });
	const button = document.createElement('button');
	shadow.appendChild(button);
	document.body.appendChild(host);
	return { host, shadow, button };
}

afterEach(() => {
	document.body.innerHTML = '';
});

describe('isolateHostEvents', () => {
	it('stops widget-originated events before they reach the document', () => {
		const { host, button } = setup();
		const seen: string[] = [];
		for (const type of ISOLATED_EVENTS) document.addEventListener(type, () => seen.push(type));
		const off = isolateHostEvents(host);

		for (const type of ISOLATED_EVENTS) {
			button.dispatchEvent(new Event(type, { bubbles: true, composed: true }));
		}
		expect(seen).toEqual([]);

		off();
		button.dispatchEvent(new Event('click', { bubbles: true, composed: true }));
		expect(seen).toEqual(['click']);
	});

	it('still lets the widget itself handle the event first', () => {
		const { host, shadow, button } = setup();
		const order: string[] = [];
		shadow.addEventListener('click', () => order.push('shadow'));
		document.addEventListener('click', () => order.push('document'));
		isolateHostEvents(host);

		button.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
		expect(order).toEqual(['shadow']);
	});

	it('does not touch events that happen on the host page', () => {
		const { host } = setup();
		const outside = document.createElement('button');
		document.body.appendChild(outside);
		let count = 0;
		document.addEventListener('click', () => (count += 1));
		isolateHostEvents(host);

		outside.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(count).toBe(1);
	});
});

describe('capture-phase focus traps', () => {
	it('hides widget focus events from capture-phase listeners on window/document', () => {
		const { host, button } = setup();
		const seen: string[] = [];
		// document-capture traps (MUI, focus-trap) lose regardless of registration
		// order because window capture runs first; window-capture traps (Headless
		// UI) are beaten when the widget loaded before the modal opened.
		for (const type of ['focus', 'focusin', 'focusout'] as const) {
			document.addEventListener(type, (e) => seen.push(`document:${type}:${(e.target as Element).tagName}`), true);
		}
		const off = isolateHostEvents(host);
		for (const type of ['focus', 'focusin', 'focusout'] as const) {
			window.addEventListener(type, (e) => seen.push(`window:${type}:${(e.target as Element).tagName}`), true);
		}

		button.dispatchEvent(new FocusEvent('focus', { composed: true }));
		button.dispatchEvent(new FocusEvent('focusin', { bubbles: true, composed: true }));
		button.dispatchEvent(new FocusEvent('focusout', { bubbles: true, composed: true }));
		expect(seen).toEqual([]);

		const outside = document.createElement('input');
		document.body.appendChild(outside);
		outside.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
		expect(seen).toEqual(['window:focusin:INPUT', 'document:focusin:INPUT']);

		off();
		seen.length = 0;
		button.dispatchEvent(new FocusEvent('focusin', { bubbles: true, composed: true }));
		expect(seen).toEqual(['window:focusin:NOTETTE-WIDGET', 'document:focusin:NOTETTE-WIDGET']);
	});

	it('still delivers blur to the widget', () => {
		const { host, button } = setup();
		let blurred = 0;
		button.addEventListener('blur', () => (blurred += 1));
		isolateHostEvents(host);
		button.dispatchEvent(new FocusEvent('blur', { composed: true }));
		expect(blurred).toBe(1);
	});
});
