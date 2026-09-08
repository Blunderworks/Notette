<script lang="ts">
	import { getContext } from 'svelte';
	import { NotetteApiError } from '../lib/api';
	import type { WidgetController } from '../lib/controller.svelte';
	import { placeNear } from '../lib/position';
	import MentionTextarea from '$lib/components/MentionTextarea.svelte';
	import type { MentionRef } from '$lib/shared/types';
	import Icon from './Icon.svelte';
	import Turnstile from './Turnstile.svelte';

	const c = getContext<WidgetController>('notette');
	const ui = c.ui;

	const target = $derived(ui.composer!);
	const author = c.getAuthor();
	let body = $state('');
	let name = $state(author.name);
	let email = $state(author.email);
	let includeScreenshot = $state(true);
	let submitting = $state(false);
	let stage = $state<'idle' | 'capturing' | 'sending'>('idle');
	let error = $state<string | null>(null);
	let input = $state<MentionTextarea | null>(null);
	let mentions = $state<MentionRef[]>([]);
	let height = $state(0);
	let tick = $state(0);
	let turnstileToken = $state<string | null>(null);
	let turnstileFailed = $state(false);
	let turnstile = $state<ReturnType<typeof Turnstile> | null>(null);
	const width = $derived(Math.min(340, window.innerWidth - 24));
	const waitingForToken = $derived(c.needsTurnstile && !turnstileToken && !turnstileFailed);
	const canSend = $derived(!submitting && !!body.trim() && (!c.needsTurnstile || !!turnstileToken));

	$effect(() => {
		input?.focus();
	});

	$effect(() => {
		const bump = () => (tick += 1);
		window.addEventListener('scroll', bump, { capture: true, passive: true });
		window.addEventListener('resize', bump);
		return () => {
			window.removeEventListener('scroll', bump, { capture: true });
			window.removeEventListener('resize', bump);
		};
	});

	const anchor = $derived.by(() => {
		void tick;
		return { x: target.pageX - window.scrollX, y: target.pageY - window.scrollY };
	});
	const placement = $derived(placeNear(anchor, width, height || 220));

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (!canSend) return;
		submitting = true;
		error = null;
		stage = includeScreenshot && ui.project?.screenshotsEnabled ? 'capturing' : 'sending';
		try {
			await c.submitFeedback({ target, body, author: { name, email }, screenshot: includeScreenshot, turnstileToken, mentions });
		} catch (err) {
			error = err instanceof NotetteApiError ? err.message : 'Could not send feedback. Please try again.';
			// The token was consumed by the failed attempt; request a new one.
			turnstile?.reset();
		} finally {
			submitting = false;
			stage = 'idle';
		}
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.stopPropagation();
			c.cancelCompose();
		} else if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
			event.preventDefault();
			(event.currentTarget as HTMLElement).closest('form')?.requestSubmit();
		}
	}
</script>

<div class="marker" style="left: {anchor.x}px; top: {anchor.y}px" aria-hidden="true"></div>

<form
	class="composer nt-card"
	style="left: {placement.left}px; top: {placement.top}px; width: {width}px"
	bind:clientHeight={height}
	onsubmit={submit}
	aria-label="New feedback"
>
	<div class="head">
		<span class="target nt-mono" title={target.label}>{target.label}</span>
		<button class="nt-icon-btn" type="button" onclick={() => c.cancelCompose()} aria-label="Cancel">
			<Icon name="close" />
		</button>
	</div>
	<MentionTextarea
		bind:this={input}
		bind:value={body}
		bind:mentions
		candidates={ui.mentionCandidates}
		class="nt-textarea"
		placement="up"
		onkeydown={onKeydown}
		placeholder={ui.mentionCandidates.length ? 'What should change here? Type @ to mention someone' : 'What should change here?'}
		maxlength={5000}
		rows={3}
		required
		disabled={submitting}
	/>
	{#if !ui.viewer && !c.config.user?.name}
		<div class="identity">
			<input class="nt-input" type="text" bind:value={name} placeholder="Your name (optional)" maxlength="120" disabled={submitting} />
			<input class="nt-input" type="email" bind:value={email} placeholder="Email (optional)" maxlength="254" disabled={submitting} />
		</div>
	{/if}
	{#if c.needsTurnstile && ui.turnstileSiteKey}
		<Turnstile bind:this={turnstile} siteKey={ui.turnstileSiteKey} action="feedback" bind:token={turnstileToken} bind:failed={turnstileFailed} />
	{/if}
	{#if error}<div class="nt-error">{error}</div>{/if}
	<div class="foot">
		{#if ui.project?.screenshotsEnabled}
			<label class="check">
				<input type="checkbox" bind:checked={includeScreenshot} disabled={submitting} />
				<Icon name="image" size={14} />
				Screenshot
			</label>
		{:else}
			<span></span>
		{/if}
		<span class="actions">
			<span class="nt-faint nt-small hint">⌘/Ctrl + Enter</span>
			<button class="nt-btn nt-btn-primary" type="submit" disabled={!canSend}>
				{#if stage === 'capturing'}Capturing…{:else if stage === 'sending'}Sending…{:else if waitingForToken}Verifying…{:else}Send{/if}
			</button>
		</span>
	</div>
</form>

<style>
	.marker {
		position: fixed;
		z-index: 30;
		width: 22px;
		height: 22px;
		margin: -11px 0 0 -11px;
		border-radius: 50%;
		background: var(--nt-accent);
		border: 3px solid #fff;
		box-shadow: var(--nt-shadow-sm);
		pointer-events: none;
	}
	.composer {
		position: fixed;
		z-index: 31;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 10px;
		animation: nt-fade-in 0.15s ease;
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.target {
		color: var(--nt-text-2);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		padding: 2px 6px;
		background: var(--nt-bg-2);
		border-radius: 4px;
	}
	.identity {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 6px;
	}
	.foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.check {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		color: var(--nt-text-2);
		font-size: 12px;
		cursor: pointer;
	}
	.check input {
		accent-color: var(--nt-accent);
		margin: 0;
	}
	.actions {
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}
	@media (max-width: 480px) {
		.hint {
			display: none;
		}
	}
</style>
