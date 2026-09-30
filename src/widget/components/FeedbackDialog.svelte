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
	// A chosen image rather than a capture: the dialog is usually opened from a settings screen, not the problem itself.
	let attachment = $state<File | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);
	let submitting = $state(false);
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

	const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
	/** Server default, for servers that predate `maxScreenshotBytes` in the config. */
	const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;

	function pickAttachment(event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		const file = target.files?.[0] ?? null;
		target.value = '';
		if (!file) return;
		if (!IMAGE_TYPES.includes(file.type)) {
			error = 'Choose a PNG, JPEG or WebP image.';
			return;
		}
		const maxBytes = ui.project?.maxScreenshotBytes ?? DEFAULT_MAX_BYTES;
		if (file.size > maxBytes) {
			error = `Choose an image under ${formatSize(maxBytes)}.`;
			return;
		}
		error = null;
		attachment = file;
	}

	function formatSize(bytes: number): string {
		if (bytes < 1024 * 1024) return `${Math.max(1, Math.floor(bytes / 1024))} KB`;
		return `${Number((bytes / (1024 * 1024)).toFixed(1))} MB`;
	}

	function close() {
		if (!submitting) c.closeFeedbackDialog();
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (!canSend) return;
		submitting = true;
		error = null;
		try {
			await c.submitDialogFeedback({ body, author: { name, email }, attachment, turnstileToken, mentions });
		} catch (err) {
			error = err instanceof NotetteApiError ? err.message : 'Could not send feedback. Please try again.';
			// The token was consumed by the failed attempt; request a new one.
			turnstile?.reset();
		} finally {
			submitting = false;
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
					<input
						class="nt-sr-only"
						type="file"
						accept={IMAGE_TYPES.join(',')}
						tabindex="-1"
						aria-hidden="true"
						bind:this={fileInput}
						onchange={pickAttachment}
					/>
					{#if attachment}
						<span class="attachment nt-small">
							<Icon name="image" size={14} />
							<span class="filename" title={attachment.name}>{attachment.name}</span>
							<button
								class="nt-icon-btn clear"
								type="button"
								onclick={() => (attachment = null)}
								disabled={submitting}
								aria-label="Remove screenshot"
							>
								<Icon name="close" size={12} />
							</button>
						</span>
					{:else}
						<button class="attach" type="button" onclick={() => fileInput?.click()} disabled={submitting}>+ Attach screenshot</button>
					{/if}
				{:else}
					<span></span>
				{/if}
				<span class="actions">
					<button class="nt-btn nt-btn-ghost" type="button" onclick={close} disabled={submitting}>Cancel</button>
					<button class="nt-btn nt-btn-primary" type="submit" disabled={!canSend}>
						{#if submitting}Sending…{:else if waitingForToken}Verifying…{:else}Send{/if}
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
	.attach {
		padding: 0;
		border: 0;
		background: none;
		color: var(--nt-accent);
		font: inherit;
		font-size: 12px;
		cursor: pointer;
	}
	.attach:hover:not(:disabled) {
		text-decoration: underline;
	}
	.attach:disabled {
		opacity: 0.6;
		cursor: default;
	}
	.attachment {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		min-width: 0;
		max-width: 100%;
		color: var(--nt-text-2);
	}
	.filename {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 180px;
	}
	.clear {
		flex: none;
		width: 22px;
		height: 22px;
		padding: 0;
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
