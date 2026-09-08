<script lang="ts">
	import { getContext } from 'svelte';
	import type { WidgetController } from '../lib/controller.svelte';
	import { elementLabel } from '../lib/dom';

	const c = getContext<WidgetController>('notette');

	let hover = $state<{ rect: DOMRect; label: string } | null>(null);

	function targetAt(x: number, y: number): Element | null {
		for (const el of document.elementsFromPoint(x, y)) {
			if (el === c.host || c.host.contains(el)) continue;
			return el;
		}
		return null;
	}

	function onMove(event: PointerEvent) {
		const el = targetAt(event.clientX, event.clientY);
		if (!el || el === document.documentElement || el === document.body) {
			hover = null;
			return;
		}
		hover = { rect: el.getBoundingClientRect(), label: elementLabel(el) };
	}

	// Picking must not move focus onto the overlay (host pages with a focus
	// trap or "focus outside" dismissal would react) or start a text selection.
	function onPointerDown(event: PointerEvent) {
		event.preventDefault();
	}

	function onClick(event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();
		// Keyboard-triggered clicks carry no meaningful coordinates.
		if (event.detail === 0 && event.clientX === 0 && event.clientY === 0) return;
		const el = targetAt(event.clientX, event.clientY);
		c.beginCompose(el, event.clientX, event.clientY);
	}

	function onKey(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			c.stopPicking();
		}
	}

	$effect(() => {
		window.addEventListener('keydown', onKey, true);
		return () => window.removeEventListener('keydown', onKey, true);
	});

	const labelTop = $derived(hover ? (hover.rect.top > 28 ? hover.rect.top - 24 : hover.rect.bottom + 4) : 0);
</script>

<button
	class="overlay"
	type="button"
	aria-label="Click an element on the page to leave feedback"
	onpointerdown={onPointerDown}
	onpointermove={onMove}
	onpointerleave={() => (hover = null)}
	onclick={onClick}
></button>

{#if hover}
	<div
		class="highlight"
		style="left: {hover.rect.left}px; top: {hover.rect.top}px; width: {hover.rect.width}px; height: {hover.rect.height}px"
	></div>
	<div class="label" style="left: {Math.max(8, hover.rect.left)}px; top: {labelTop}px">{hover.label}</div>
{/if}

<div class="hint" role="status">
	Click any element to leave feedback · <kbd>Esc</kbd> to cancel
</div>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 10;
		width: 100%;
		height: 100%;
		padding: 0;
		border: none;
		cursor: crosshair;
		background: rgba(79, 70, 229, 0.03);
	}
	.overlay:focus-visible {
		outline: 3px solid var(--nt-accent);
		outline-offset: -3px;
	}
	.highlight {
		position: fixed;
		z-index: 11;
		pointer-events: none;
		border: 2px solid var(--nt-accent);
		border-radius: 3px;
		background: rgba(79, 70, 229, 0.08);
		box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.6);
		transition:
			left 0.05s,
			top 0.05s,
			width 0.05s,
			height 0.05s;
	}
	.label {
		position: fixed;
		z-index: 12;
		pointer-events: none;
		padding: 2px 7px;
		border-radius: 4px;
		background: var(--nt-accent);
		color: #fff;
		font-family: var(--nt-mono);
		font-size: 11px;
		max-width: 60vw;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.hint {
		position: fixed;
		top: 14px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 12;
		padding: 7px 14px;
		border-radius: 999px;
		background: rgba(20, 24, 31, 0.92);
		color: #fff;
		font-size: 12.5px;
		box-shadow: var(--nt-shadow-sm);
		pointer-events: none;
		animation: nt-fade-in 0.15s ease;
		white-space: nowrap;
	}
	.hint kbd {
		background: rgba(255, 255, 255, 0.15);
		border-color: rgba(255, 255, 255, 0.3);
		color: #fff;
	}
</style>
