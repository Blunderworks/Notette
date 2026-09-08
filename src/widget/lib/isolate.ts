/**
 * Keeps interaction events that originate inside the widget from reaching the
 * host page. Events fired inside a shadow tree are retargeted to the host
 * element and then bubble on to `document`/`window`, where host pages commonly
 * listen for "click outside", focus-outside or keyboard shortcuts; a modal that
 * closes because the reviewer clicked the picker overlay or typed in the
 * composer is the typical symptom. Stopping propagation at the host element
 * leaves the widget's own (delegated) handlers untouched, since they run on
 * the shadow root before the event reaches the host.
 *
 * Only bubbling listeners on ancestors of the host are affected; capture-phase
 * listeners on `window`/`document` still run before the event enters the
 * widget and are left alone.
 */
export const ISOLATED_EVENTS = [
	'pointerdown',
	'pointerup',
	'pointercancel',
	'mousedown',
	'mouseup',
	'click',
	'dblclick',
	'auxclick',
	'contextmenu',
	'touchstart',
	'touchend',
	'touchcancel',
	'keydown',
	'keyup',
	'keypress',
	'focusin',
	'focusout'
] as const;

function stop(event: Event): void {
	event.stopPropagation();
}

/** Installs the listeners on `host`; returns a function that removes them again. */
export function isolateHostEvents(host: HTMLElement): () => void {
	for (const type of ISOLATED_EVENTS) host.addEventListener(type, stop);
	return () => {
		for (const type of ISOLATED_EVENTS) host.removeEventListener(type, stop);
	};
}
