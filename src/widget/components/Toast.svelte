<script lang="ts">
	import { getContext } from 'svelte';
	import type { WidgetController } from '../lib/controller.svelte';

	const c = getContext<WidgetController>('notette');
	const ui = c.ui;
</script>

{#if ui.toast}
	{#key ui.toast.id}
		<div class="toast {ui.toast.kind}" role="status" aria-live="polite">{ui.toast.message}</div>
	{/key}
{/if}

<style>
	.toast {
		position: fixed;
		bottom: 80px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 60;
		padding: 8px 14px;
		border-radius: 999px;
		background: rgba(20, 24, 31, 0.92);
		color: #fff;
		font-size: 12.5px;
		box-shadow: var(--nt-shadow-sm);
		animation: nt-fade-in 0.15s ease;
		white-space: nowrap;
		max-width: calc(100vw - 24px);
		overflow: hidden;
		text-overflow: ellipsis;
		pointer-events: none;
	}
	.toast.success {
		background: #166534;
	}
	.toast.error {
		background: #991b1b;
	}
</style>
