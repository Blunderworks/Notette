<script lang="ts">
	import { getContext } from 'svelte';
	import type { WidgetController } from '../lib/controller.svelte';
	import Icon from './Icon.svelte';

	const c = getContext<WidgetController>('notette');
	const ui = c.ui;
	const req = $derived(ui.confirm);
	const danger = $derived(req?.danger ?? true);

	let confirmButton = $state<HTMLButtonElement | null>(null);
	$effect(() => {
		confirmButton?.focus();
	});

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.stopPropagation();
			c.answerConfirm(false);
		}
	}
</script>

{#if req}
	<div class="backdrop" role="presentation" onclick={() => c.answerConfirm(false)}></div>
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div class="dialog nt-card" role="alertdialog" aria-modal="true" aria-label={req.title} tabindex="-1" onkeydown={onKeydown}>
		<div class="head">
			<span class="icon" class:danger><Icon name={danger ? 'trash' : 'info'} /></span>
			<div class="text">
				<strong>{req.title}</strong>
				{#if req.message}<p class="nt-muted">{req.message}</p>{/if}
			</div>
		</div>
		<div class="actions">
			<button class="nt-btn" type="button" onclick={() => c.answerConfirm(false)}>{req.cancelLabel ?? 'Cancel'}</button>
			<button class="nt-btn {danger ? 'nt-btn-danger' : 'nt-btn-primary'}" type="button" bind:this={confirmButton} onclick={() => c.answerConfirm(true)}>
				{req.confirmLabel ?? 'Confirm'}
			</button>
		</div>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 54;
		background: rgba(10, 13, 18, 0.45);
		animation: nt-fade-in 0.15s ease;
	}
	.dialog {
		position: fixed;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		z-index: 55;
		width: min(360px, calc(100vw - 24px));
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 16px;
		animation: nt-fade-in 0.15s ease;
	}
	.dialog:focus {
		outline: none;
	}
	.head {
		display: flex;
		gap: 12px;
		align-items: flex-start;
	}
	.icon {
		flex: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 34px;
		height: 34px;
		border-radius: 50%;
		background: var(--nt-accent-soft);
		color: var(--nt-accent);
	}
	.icon.danger {
		background: var(--nt-danger-soft);
		color: var(--nt-danger);
	}
	.text {
		min-width: 0;
		padding-top: 6px;
	}
	.text strong {
		font-size: 14px;
	}
	.text p {
		margin: 4px 0 0;
		overflow-wrap: anywhere;
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 6px;
	}
</style>
