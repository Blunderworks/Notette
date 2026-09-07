<script lang="ts">
	import { getContext } from 'svelte';
	import type { WidgetController } from '../lib/controller.svelte';
	import Icon from './Icon.svelte';

	const c = getContext<WidgetController>('notette');
	const ui = c.ui;
	const auth = $derived(ui.auth);
</script>

<div class="dialog nt-card" role="dialog" aria-label="Admin sign-in">
	<div class="head">
		<strong>Admin sign-in</strong>
		<button class="nt-icon-btn" type="button" onclick={() => c.cancelSignIn()} aria-label="Close"><Icon name="close" /></button>
	</div>
	{#if auth.status === 'waiting'}
		<p class="nt-muted">Approve the request in the Notette window that just opened. This page will update automatically.</p>
		<div class="actions">
			<a class="nt-btn" href={auth.url} target="notette-authorize" rel="noopener">Reopen window</a>
			<button class="nt-btn nt-btn-ghost" type="button" onclick={() => c.cancelSignIn()}>Cancel</button>
		</div>
	{:else if auth.status === 'blocked'}
		<p class="nt-muted">Your browser blocked the popup. Open the sign-in page in a new tab, approve the request, then come back here.</p>
		<div class="actions">
			<a class="nt-btn nt-btn-primary" href={auth.url} target="_blank" rel="noopener">Open sign-in page</a>
			<button class="nt-btn nt-btn-ghost" type="button" onclick={() => c.cancelSignIn()}>Cancel</button>
		</div>
	{:else if auth.status === 'denied'}
		<p class="nt-muted">The request was denied.</p>
		<div class="actions"><button class="nt-btn" type="button" onclick={() => c.cancelSignIn()}>Close</button></div>
	{:else if auth.status === 'expired'}
		<p class="nt-muted">The sign-in request expired. Try again.</p>
		<div class="actions">
			<button class="nt-btn nt-btn-primary" type="button" onclick={() => { c.cancelSignIn(); c.signIn(); }}>Try again</button>
			<button class="nt-btn nt-btn-ghost" type="button" onclick={() => c.cancelSignIn()}>Close</button>
		</div>
	{:else}
		<div class="nt-error">{auth.message || 'Sign-in failed.'}</div>
		<div class="actions"><button class="nt-btn" type="button" onclick={() => c.cancelSignIn()}>Close</button></div>
	{/if}
</div>

<style>
	.dialog {
		position: fixed;
		right: 20px;
		bottom: 84px;
		z-index: 45;
		width: min(320px, calc(100vw - 24px));
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 12px;
		animation: nt-fade-in 0.15s ease;
	}
	:global(.nt-root[data-position='bottom-left']) .dialog {
		right: auto;
		left: 20px;
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.actions {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}
</style>
