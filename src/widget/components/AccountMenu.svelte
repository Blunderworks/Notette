<script lang="ts">
	import { getContext } from 'svelte';
	import type { WidgetController } from '../lib/controller.svelte';
	import Icon from './Icon.svelte';

	const c = getContext<WidgetController>('notette');
	const ui = c.ui;

	let menu = $state<HTMLElement | null>(null);
	let busy = $state(false);

	// Close on clicks elsewhere. The listener only observes; it never blocks the
	// host page. Capture phase, because bubbling pointer events from inside the
	// widget are stopped at the host element (see lib/isolate.ts).
	$effect(() => {
		const onPointerDown = (event: PointerEvent) => {
			const path = event.composedPath();
			if (!menu || path.includes(menu)) return;
			// The avatar button toggles the menu itself.
			if (path.some((node) => node instanceof HTMLElement && node.classList.contains('avatar'))) return;
			c.closeAccountMenu();
		};
		window.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true });
		return () => window.removeEventListener('pointerdown', onPointerDown, { capture: true });
	});

	async function toggleEmail(event: Event) {
		const enabled = (event.currentTarget as HTMLInputElement).checked;
		busy = true;
		try {
			await c.setEmailNotifications(enabled);
		} finally {
			busy = false;
		}
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.stopPropagation();
			c.closeAccountMenu();
		}
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="menu nt-card" bind:this={menu} role="dialog" aria-label="Account" tabindex="-1" onkeydown={onKeydown}>
	<div class="who">
		<strong class="name">{ui.viewer?.name}</strong>
		<span class="nt-faint nt-small email">{ui.viewer?.email}</span>
		<span class="nt-badge {ui.viewer?.admin ? 'nt-badge-admin' : 'nt-badge-member'}">{ui.viewer?.admin ? 'admin' : 'member'}</span>
	</div>
	{#if ui.emailEnabled}
		<label class="pref">
			<input type="checkbox" checked={ui.viewer?.emailNotifications ?? true} onchange={toggleEmail} disabled={busy} />
			<span class="pref-text">
				<span>Email notifications for this site</span>
				<span class="nt-faint nt-small">New feedback, replies in your threads and @-mentions, grouped into one email.</span>
			</span>
		</label>
	{/if}
	<button class="nt-btn nt-btn-sm signout" type="button" onclick={() => c.signOut()}>
		<Icon name="logout" size={13} />
		Sign out
	</button>
</div>

<style>
	.menu {
		position: fixed;
		right: 20px;
		bottom: 84px;
		z-index: 46;
		width: min(300px, calc(100vw - 24px));
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 12px;
		animation: nt-fade-in 0.15s ease;
	}
	:global(.nt-root[data-position='bottom-left']) .menu {
		right: auto;
		left: 20px;
	}
	.who {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 8px;
		min-width: 0;
	}
	.name,
	.email {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 100%;
	}
	.email {
		flex-basis: 100%;
	}
	.pref {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		padding: 8px 10px;
		border-radius: var(--nt-radius-sm);
		background: var(--nt-bg-2);
		cursor: pointer;
	}
	.pref input {
		margin-top: 2px;
		accent-color: var(--nt-accent);
	}
	.pref-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.signout {
		align-self: flex-start;
	}
	@media (max-width: 480px) {
		.menu {
			right: 12px;
			bottom: 76px;
		}
	}
</style>
