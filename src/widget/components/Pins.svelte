<script lang="ts">
	import { getContext } from 'svelte';
	import type { WidgetController } from '../lib/controller.svelte';
	import { pinPosition, type PinPosition } from '../lib/dom';

	const c = getContext<WidgetController>('notette');
	const ui = c.ui;

	let positions = $state<Record<string, PinPosition>>({});
	let selectedRect = $state<DOMRect | null>(null);
	let raf = 0;

	function recompute() {
		const next: Record<string, PinPosition> = {};
		const margin = 40;
		for (const item of c.visiblePageItems) {
			const p = pinPosition(item);
			if (!p) continue;
			if (p.x < -margin || p.y < -margin || p.x > window.innerWidth + margin || p.y > window.innerHeight + margin) {
				continue;
			}
			next[item.id] = p;
		}
		positions = next;
		const selected = ui.selectedId ? next[ui.selectedId] : undefined;
		selectedRect = selected?.element ? selected.element.getBoundingClientRect() : null;
	}

	function schedule() {
		if (raf) return;
		raf = requestAnimationFrame(() => {
			raf = 0;
			recompute();
		});
	}

	$effect(() => {
		void ui.layoutTick;
		void ui.pageItems.length;
		void ui.statusFilter;
		void ui.selectedId;
		schedule();
	});

	$effect(() => {
		window.addEventListener('scroll', schedule, { capture: true, passive: true });
		window.addEventListener('resize', schedule);
		const observer = new ResizeObserver(schedule);
		observer.observe(document.documentElement);
		if (document.body) observer.observe(document.body);
		return () => {
			window.removeEventListener('scroll', schedule, { capture: true });
			window.removeEventListener('resize', schedule);
			observer.disconnect();
			if (raf) cancelAnimationFrame(raf);
			raf = 0;
		};
	});
</script>

<div class="layer">
	{#if selectedRect}
		<div
			class="outline"
			style="left: {selectedRect.left}px; top: {selectedRect.top}px; width: {selectedRect.width}px; height: {selectedRect.height}px"
		></div>
	{/if}
	{#each c.visiblePageItems as item (item.id)}
		{@const p = positions[item.id]}
		{#if p}
			<button
				class="pin"
				class:resolved={item.status === 'resolved'}
				class:selected={ui.selectedId === item.id}
				class:approx={p.approximate}
				class:highlight={ui.highlightId === item.id}
				style="left: {p.x}px; top: {p.y}px"
				type="button"
				onclick={(e) => {
					e.stopPropagation();
					if (ui.selectedId === item.id) c.closeThread();
					else void c.openThread(item.id);
				}}
				title="#{item.number}{p.approximate ? ' (approximate position)' : ''}: {item.body.slice(0, 80)}"
				aria-label="Feedback #{item.number}"
			>
				{item.number}
			</button>
		{/if}
	{/each}
</div>

<style>
	.layer {
		position: fixed;
		inset: 0;
		z-index: 20;
		pointer-events: none;
	}
	.outline {
		position: fixed;
		pointer-events: none;
		border: 2px dashed var(--nt-accent);
		border-radius: 3px;
		background: rgba(79, 70, 229, 0.06);
	}
	.pin {
		position: fixed;
		pointer-events: auto;
		width: 26px;
		height: 26px;
		margin: -13px 0 0 -13px;
		padding: 0;
		border-radius: 50%;
		border: 2px solid #fff;
		background: var(--nt-accent);
		color: #fff;
		font-size: 11px;
		font-weight: 700;
		line-height: 1;
		display: grid;
		place-items: center;
		box-shadow: var(--nt-shadow-sm);
		transition:
			transform 0.12s,
			background 0.12s;
	}
	.pin:hover,
	.pin.selected {
		transform: scale(1.18);
		z-index: 1;
	}
	.pin.resolved {
		background: var(--nt-success);
		opacity: 0.85;
	}
	.pin.approx {
		border-style: dashed;
	}
	.pin.highlight {
		animation: nt-pulse 1s ease-out 3;
	}
</style>
