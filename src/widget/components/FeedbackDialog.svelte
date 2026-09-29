<script lang="ts">
	import { getContext } from 'svelte';
	import { NotetteApiError } from '../lib/api';
	import type { WidgetController } from '../lib/controller.svelte';
	import MentionTextarea from '$lib/components/MentionTextarea.svelte';
	import type { MentionRef } from '$lib/shared/types';
	import Icon from './Icon.svelte';
	import Turnstile from './Turnstile.svelte';

	const c = getContext<WidgetController>('notette');
	const ui = c.ui;

	const author = c.getAuthor();
	let body = $state('');
	let name = $state(author.name);
	let email = $state(author.email);
	// Opt-in here: the dialog is usually opened from a settings screen, not the problem itself.
	let includeScreenshot = $state(false);
	let submitting = $state(false);
	let stage = $state<'idle' | 'capturing' | 'sending'>('idle');
	let error = $state<string | null>(null);
	let input = $state<MentionTextarea | null>(null);
	let closeButton = $state<HTMLButtonElement | null>(null);
	let mentions = $state<MentionRef[]>([]);
	let turnstileToken = $state<string | null>(null);
	let turnstileFailed = $state(false);
	let turnstile = $state<ReturnType<typeof Turnstile> | null>(null);
	/** Host identity mode on a sign-in-only project, but the app user could not be verified. */
	const unavailable = $derived(c.requiresSignIn);
	const sender = $derived(
		ui.viewer ? ui.viewer.name : ui.identity ? (ui.identity.name ?? ui.identity.email ?? 'your account') : null
	);
	const waitingForToken = $derived(c.needsTurnstile && !turnstileToken && !turnstileFailed);
	const canSend = $derived(!submitting && !unavailable && !!body.trim() && (!c.needsTurnstile || !!turnstileToken));

	// Focus inside the dialog so Escape and Tab work, whichever state it opens in.
	$effect(() => {
		if (input) input.focus();
		else closeButton?.focus();
	});

	function close() {
		if (!submitting) c.closeFeedbackDialog();
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (!canSend) return;
		submitting = true;
		error = null;
		stage = includeScreenshot && ui.project?.screenshotsEnabled ? 'capturing' : 'sending';
		try {
			await c.submitDialogFeedback({ body, author: { name, email }, screenshot: includeScreenshot, turnstileToken, mentions });
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
			close();
		} else if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
			event.preventDefault();
			(event.currentTarget as HTMLElement).querySelector('form')?.requestSubmit();
		}
	}
</script>

<div class="backdrop" role="presentation" onclick={close}></div>
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="dialog nt-card" role="dialog" aria-modal="true" aria-labelledby="nt-feedback-title" tabindex="-1" onkeydown={onKeydown}>
	<form onsubmit={submit}>
		<div class="head">
			<strong id="nt-feedback-title">Send feedback</strong>
			<button class="nt-icon-btn" type="button" onclick={close} aria-label="Close">
				<Icon name="close" />
			</button>
		</div>
		{#if unavailable}
			<p class="nt-muted">
				{#if ui.identityError}
					We could not verify your account, so feedback is unavailable right now. Try reloading the page.
				{:else}
					Sign in to this site to send feedback.
				{/if}
			</p>
			<div class="foot">
				<span></span>
				<button class="nt-btn" type="button" onclick={close} bind:this={closeButton}>Close</button>
			</div>
		{:else}
			<label class="nt-sr-only" for="nt-feedback-body">Your feedback</label>
			<MentionTextarea
				bind:this={input}
				bind:value={body}
				bind:mentions
				id="nt-feedback-body"
				candidates={ui.mentionCandidates}
				class="nt-textarea"
				placeholder="What's working well, and what could be better?"
				maxlength={5000}
				rows={5}
				required
				disabled={submitting}
			/>
			{#if sender}
				<p class="nt-small nt-muted">Posting as <strong>{sender}</strong></p>
			{:else if !c.config.user?.name}
				<div class="identity">
					<input class="nt-input" type="text" bind:value={name} placeholder="Your name (optional)" maxlength="120" disabled={submitting} />
					<input class="nt-input" type="email" bind:value={email} placeholder="Email (optional)" maxlength="254" disabled={submitting} />
				</div>
			{/if}
			{#if ui.identityError && !ui.identity}
				<p class="notice nt-small">We could not verify your account, so this feedback is sent without your details.</p>
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
						Include screenshot
					</label>
				{:else}
					<span></span>
				{/if}
				<span class="actions">
					<button class="nt-btn nt-btn-ghost" type="button" onclick={close} disabled={submitting}>Cancel</button>
					<button class="nt-btn nt-btn-primary" type="submit" disabled={!canSend}>
						{#if stage === 'capturing'}Capturing…{:else if stage === 'sending'}Sending…{:else if waitingForToken}Verifying…{:else}Send{/if}
					</button>
				</span>
			</div>
		{/if}
	</form>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 52;
		background: rgba(10, 13, 18, 0.45);
		animation: nt-fade-in 0.15s ease;
	}
	/* Centred without transform: the shared fade-in animation animates transform. */
	.dialog {
		position: fixed;
		inset: 0;
		margin: auto;
		z-index: 53;
		width: min(440px, calc(100vw - 24px));
		height: fit-content;
		max-height: calc(100dvh - 24px);
		overflow: auto;
		padding: 14px;
		animation: nt-fade-in 0.15s ease;
	}
	.dialog:focus {
		outline: none;
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin: 0;
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.head strong {
		font-size: 14px;
	}
	.identity {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 6px;
	}
	.notice {
		padding: 6px 9px;
		border-radius: var(--nt-radius-sm);
		background: var(--nt-warning-soft);
		color: var(--nt-warning-text);
	}
	.foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		flex-wrap: wrap;
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
		gap: 6px;
		margin-left: auto;
	}
	@media (max-width: 480px) {
		.identity {
			grid-template-columns: 1fr;
		}
	}
</style>
