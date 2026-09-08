<script lang="ts">
	import { getContext } from 'svelte';
	import type { WidgetController } from '../lib/controller.svelte';
	import AccountMenu from './AccountMenu.svelte';
	import Icon from './Icon.svelte';

	const c = getContext<WidgetController>('notette');
	const ui = c.ui;

	const openCount = $derived(ui.pageItems.filter((i) => i.status === 'open').length);
	const initials = $derived(
		(ui.viewer?.name ?? '')
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((p) => p[0]?.toUpperCase() ?? '')
			.join('') || 'A'
	);
</script>

<div class="launcher" class:left={c.config.position === 'bottom-left'}>
	{#if ui.expanded && ui.accountMenuOpen && ui.viewer}
		<AccountMenu />
	{/if}
	{#if ui.expanded}
		<div class="toolbar nt-card" role="toolbar" aria-label="Notette feedback">
			<button
				class="nt-btn"
				class:nt-btn-primary={ui.picking}
				type="button"
				onclick={() => c.togglePicking()}
				aria-pressed={ui.picking}
			>
				<Icon name={ui.picking ? 'close' : 'comment'} />
				{ui.picking ? 'Cancel' : 'Comment'}
			</button>
			{#if c.canSeeFeedback}
				<button
					class="nt-btn nt-btn-ghost"
					type="button"
					onclick={() => c.togglePins()}
					aria-pressed={ui.pinsVisible}
					title={ui.pinsVisible ? 'Hide pins' : 'Show pins'}
				>
					<Icon name={ui.pinsVisible ? 'eye' : 'eyeOff'} />
					Pins
					{#if openCount > 0}<span class="count">{openCount}</span>{/if}
				</button>
				<button
					class="nt-btn nt-btn-ghost"
					class:active={ui.panelOpen}
					type="button"
					onclick={() => c.togglePanel()}
					aria-pressed={ui.panelOpen}
					title="Browse feedback"
				>
					<Icon name="list" />
					List
				</button>
			{/if}
			<span class="sep"></span>
			{#if ui.viewer}
				<button
					class="avatar"
					class:member={!ui.viewer.admin}
					type="button"
					onclick={() => c.toggleAccountMenu()}
					aria-expanded={ui.accountMenuOpen}
					aria-haspopup="dialog"
					title="Signed in as {ui.viewer.name}{ui.viewer.admin ? '' : ' (member)'}"
				>
					{initials}
				</button>
			{:else}
				<button class="nt-btn nt-btn-ghost" type="button" onclick={() => c.openSignIn()} title="Sign in with a Notette account">
					<Icon name="user" />
					Sign in
				</button>
			{/if}
			<button class="nt-icon-btn" type="button" onclick={() => c.collapse()} aria-label="Close feedback toolbar">
				<Icon name="close" />
			</button>
		</div>
	{:else}
		<button class="bubble" type="button" onclick={() => c.expand()} aria-label="Open feedback" title="Feedback">
			<Icon name="comment" size={22} />
			{#if openCount > 0 && c.canSeeFeedback}<span class="bubble-count">{openCount}</span>{/if}
		</button>
	{/if}
</div>

<style>
	.launcher {
		position: fixed;
		right: 20px;
		bottom: 20px;
		z-index: 50;
		display: flex;
		justify-content: flex-end;
	}
	.launcher.left {
		right: auto;
		left: 20px;
		justify-content: flex-start;
	}
	.bubble {
		position: relative;
		width: 48px;
		height: 48px;
		border-radius: 50%;
		border: none;
		background: var(--nt-accent);
		color: #fff;
		display: grid;
		place-items: center;
		box-shadow: var(--nt-shadow);
		transition:
			transform 0.12s,
			background 0.12s;
	}
	.bubble:hover {
		background: var(--nt-accent-hover);
		transform: translateY(-1px);
	}
	.bubble-count {
		position: absolute;
		top: -4px;
		right: -4px;
		min-width: 20px;
		height: 20px;
		padding: 0 6px;
		border-radius: 999px;
		background: #fff;
		color: var(--nt-accent);
		font-size: 11px;
		font-weight: 700;
		display: grid;
		place-items: center;
		border: 2px solid var(--nt-accent);
	}
	.toolbar {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 6px;
		border-radius: 999px;
		animation: nt-fade-in 0.15s ease;
	}
	.toolbar :global(.nt-btn) {
		border-radius: 999px;
	}
	.toolbar :global(.nt-btn.active) {
		background: var(--nt-bg-2);
		color: var(--nt-text);
	}
	.count {
		min-width: 18px;
		padding: 0 5px;
		border-radius: 999px;
		background: var(--nt-accent);
		color: #fff;
		font-size: 10.5px;
		font-weight: 600;
		line-height: 18px;
		text-align: center;
	}
	.sep {
		width: 1px;
		height: 20px;
		background: var(--nt-border);
		margin: 0 2px;
	}
	.avatar {
		width: 30px;
		height: 30px;
		border-radius: 50%;
		border: none;
		background: var(--nt-accent-soft);
		color: #3730a3;
		font-size: 11.5px;
		font-weight: 700;
	}
	.avatar:hover {
		background: #e0e7ff;
	}
	.avatar.member {
		background: var(--nt-bg-2);
		color: var(--nt-text-2);
	}
	.avatar.member:hover {
		background: var(--nt-bg-3);
	}
	@media (max-width: 480px) {
		.launcher {
			right: 12px;
			bottom: 12px;
			max-width: calc(100vw - 24px);
		}
		.toolbar {
			flex-wrap: wrap;
			border-radius: 16px;
		}
	}
</style>
