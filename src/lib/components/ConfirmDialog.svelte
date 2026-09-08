<script lang="ts">
	import { answerConfirm, confirmState } from '$lib/confirm.svelte';

	let dialog = $state<HTMLDialogElement | null>(null);
	let confirmButton = $state<HTMLButtonElement | null>(null);
	const pending = $derived(confirmState.pending);

	$effect(() => {
		if (!dialog) return;
		if (pending) {
			if (!dialog.open) dialog.showModal();
			confirmButton?.focus();
		} else if (dialog.open) {
			dialog.close();
		}
	});

	function onCancel(event: Event) {
		// Esc key: the browser closes the dialog; keep our state in sync.
		event.preventDefault();
		answerConfirm(false);
	}

	function onBackdropClick(event: MouseEvent) {
		if (event.target === dialog) answerConfirm(false);
	}
</script>

<dialog class="confirm-dialog" bind:this={dialog} oncancel={onCancel} onclick={onBackdropClick} aria-labelledby="confirm-title">
	{#if pending}
		<div class="confirm-panel" class:danger={pending.danger ?? true}>
			<div class="confirm-icon" aria-hidden="true">
				{#if pending.danger ?? true}
					<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
					</svg>
				{:else}
					<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
					</svg>
				{/if}
			</div>
			<div class="confirm-text">
				<h2 id="confirm-title">{pending.title}</h2>
				{#if pending.message}<p>{pending.message}</p>{/if}
			</div>
			<div class="confirm-actions">
				<button class="btn" type="button" onclick={() => answerConfirm(false)}>{pending.cancelLabel ?? 'Cancel'}</button>
				<button
					class="btn {(pending.danger ?? true) ? 'btn-danger' : 'btn-primary'}"
					type="button"
					bind:this={confirmButton}
					onclick={() => answerConfirm(true)}
				>
					{pending.confirmLabel ?? 'Confirm'}
				</button>
			</div>
		</div>
	{/if}
</dialog>
