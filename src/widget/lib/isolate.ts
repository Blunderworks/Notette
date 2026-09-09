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
 * widget and are left alone — except for focus events: focus-trap
 * implementations (MUI's FocusTrap, focus-trap, Headless UI) watch `focusin`
 * or `focus` in the capture phase and pull focus back into their modal, which
 * left the composer's textarea unfocusable while a host modal was open. Those
 * are stopped at `window` (`stopImmediatePropagation`, since the trap may sit
 * on `window` too) before the host page sees them; the widget itself only
 * listens for `blur`, which is left alone. A window-capture trap registered
 * before the widget script ran still runs first — only a dialog that is
 * already open when the page loads is affected.
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

/** Focus events stopped at `window` in the capture phase when they come from the widget. */
export const CAPTURED_FOCUS_EVENTS = ['focus', 'focusin', 'focusout'] as const;

function stop(event: Event): void {
	event.stopPropagation();
}

/** Installs the listeners on `host`; returns a function that removes them again. */
export function isolateHostEvents(host: HTMLElement): () => void {
	// Events from inside the shadow tree are retargeted to the host by the time
	// they reach window, so this never touches the host page's own focus events.
	const stopFromWidget = (event: Event) => {
		if (event.target === host) event.stopImmediatePropagation();
	};
	for (const type of ISOLATED_EVENTS) host.addEventListener(type, stop);
	for (const type of CAPTURED_FOCUS_EVENTS) window.addEventListener(type, stopFromWidget, true);
	return () => {
		for (const type of ISOLATED_EVENTS) host.removeEventListener(type, stop);
		for (const type of CAPTURED_FOCUS_EVENTS) window.removeEventListener(type, stopFromWidget, true);
	};
}
