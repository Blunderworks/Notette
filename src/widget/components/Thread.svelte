<script lang="ts">
	import { getContext } from 'svelte';
	import { formatFeedbackForAgent } from '$lib/shared/agent-format';
	import { timeAgo } from '$lib/format';
	import { NotetteApiError } from '../lib/api';
	import type { WidgetController } from '../lib/controller.svelte';
	import { pinPosition } from '../lib/dom';
	import { placeNear } from '../lib/position';
	import MentionText from '$lib/components/MentionText.svelte';
	import MentionTextarea from '$lib/components/MentionTextarea.svelte';
	import type { MentionRef } from '$lib/shared/types';
	import Icon from './Icon.svelte';
	import Turnstile from './Turnstile.svelte';

	const c = getContext<WidgetController>('notette');
	const ui = c.ui;

	const item = $derived(ui.detail);
	let height = $state(0);
	let tick = $state(0);
	let replyBody = $state('');
	let replyMentions = $state<MentionRef[]>([]);
	const author = c.getAuthor();
	let name = $state(author.name);
	let email = $state(author.email);
	let busy = $state(false);
	let error = $state<string | null>(null);
	let copied = $state(false);
	let screenshotUrl = $state<string | null>(null);
	let screenshotOpen = $state(false);
	let turnstileToken = $state<string | null>(null);
	let turnstileFailed = $state(false);
	let turnstile = $state<ReturnType<typeof Turnstile> | null>(null);
	const width = $derived(Math.min(380, window.innerWidth - 24));
	const waitingForToken = $derived(c.needsTurnstile && !turnstileToken && !turnstileFailed);
	const canReplyNow = $derived(!busy && !!replyBody.trim() && (!c.needsTurnstile || !!turnstileToken));

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
		void ui.layoutTick;
		const summary = ui.pageItems.find((i) => i.id === ui.selectedId);
		if (!summary) return null;
		return pinPosition(summary);
	});

	const placement = $derived.by(() => {
		if (anchor) return placeNear({ x: anchor.x, y: anchor.y }, width, height || 300);
		const margin = 12;
		return {
			left: Math.max(margin, window.innerWidth - width - 20),
			top: Math.max(margin, window.innerHeight - (height || 300) - 84)
		};
	});

	// Load the screenshot through the API (image tags cannot send bearer tokens).
	$effect(() => {
		const id = item?.id;
		const has = item?.hasScreenshot;
		screenshotUrl = null;
		screenshotOpen = false;
		if (!id || !has) return;
		let url: string | null = null;
		let cancelled = false;
		void c.loadScreenshot(id).then((result) => {
			if (cancelled) {
				if (result) URL.revokeObjectURL(result);
				return;
			}
			url = result;
			screenshotUrl = result;
		});
		return () => {
			cancelled = true;
			if (url) URL.revokeObjectURL(url);
		};
	});

	async function sendReply(event: SubmitEvent) {
		event.preventDefault();
		if (!item || !canReplyNow) return;
		busy = true;
		error = null;
		try {
			await c.reply(item.id, replyBody, { name, email }, turnstileToken, replyMentions);
			replyBody = '';
			replyMentions = [];
		} catch (err) {
			error = err instanceof NotetteApiError ? err.message : 'Could not post reply.';
		} finally {
			busy = false;
			// Tokens are single-use; request a fresh one for the next reply.
			turnstile?.reset();
		}
	}

	async function toggleStatus() {
		if (!item || busy) return;
		busy = true;
		error = null;
		try {
			await c.setStatus(item.id, item.status === 'open' ? 'resolved' : 'open');
		} catch (err) {
			error = err instanceof NotetteApiError ? err.message : 'Could not update status.';
		} finally {
			busy = false;
		}
	}

	async function remove() {
		if (!item || busy) return;
		const ok = await c.confirm({
			title: `Delete feedback #${item.number}?`,
			message: 'The item, its replies and its screenshot will be permanently deleted.',
			confirmLabel: 'Delete'
		});
		if (!ok || busy) return;
		busy = true;
		try {
			await c.remove(item.id);
		} catch (err) {
			error = err instanceof NotetteApiError ? err.message : 'Could not delete.';
			busy = false;
		}
	}

	async function copyForAgent() {
		if (!item) return;
		const text = formatFeedbackForAgent(item, {
			projectName: ui.project?.name,
			dashboardUrl: dashboardLink
		});
		let ok = false;
		try {
			await navigator.clipboard.writeText(text);
			ok = true;
		} catch {
			const area = document.createElement('textarea');
			area.value = text;
			area.style.position = 'fixed';
			area.style.opacity = '0';
			c.host.shadowRoot?.appendChild(area);
			area.select();
			try {
				ok = document.execCommand('copy');
			} catch {
				ok = false;
			}
			area.remove();
		}
		if (ok) {
			copied = true;
			setTimeout(() => (copied = false), 1800);
		} else {
			c.toast('Clipboard unavailable', 'error');
		}
	}

	const dashboardLink = $derived(
		item && ui.project ? `${ui.dashboardUrl}/projects/${ui.project.id}/feedback/${item.id}` : undefined
	);

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.stopPropagation();
			c.closeThread();
		} else if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
			event.preventDefault();
			(event.currentTarget as HTMLElement).closest('form')?.requestSubmit();
		}
	}
</script>

<section
	class="thread nt-card"
	style="left: {placement.left}px; top: {placement.top}px; width: {width}px"
	bind:clientHeight={height}
	aria-label={item ? `Feedback #${item.number}` : 'Feedback'}
>
	{#if !item}
		<div class="head">
			<span class="nt-muted">{ui.detailLoading ? 'Loading…' : 'Not found'}</span>
			<button class="nt-icon-btn" type="button" onclick={() => c.closeThread()} aria-label="Close"><Icon name="close" /></button>
		</div>
	{:else}
		<div class="head">
			<span class="title">
				<strong>#{item.number}</strong>
				<span class="nt-badge {item.status === 'open' ? 'nt-badge-open' : 'nt-badge-resolved'}">{item.status}</span>
				{#if anchor?.approximate}<span class="nt-faint nt-small" title="The original element was not found; showing the recorded position">approx.</span>{/if}
			</span>
			<span class="head-actions">
				<button class="nt-icon-btn" type="button" onclick={copyForAgent} title="Copy for Agent" aria-label="Copy for Agent">
					<Icon name={copied ? 'check' : 'copy'} />
				</button>
				{#if c.isAdmin && dashboardLink}
					<a class="nt-icon-btn" href={dashboardLink} target="_blank" rel="noopener" title="Open in dashboard" aria-label="Open in dashboard">
						<Icon name="external" />
					</a>
				{/if}
				<button class="nt-icon-btn" type="button" onclick={() => c.closeThread()} aria-label="Close"><Icon name="close" /></button>
			</span>
		</div>

		<div class="scroll">
			<div class="message root">
				<div class="meta">
					<span class="author">{item.authorName ?? 'Anonymous'}</span>
					{#if item.isAdmin}<span class="nt-badge nt-badge-admin">admin</span>{:else if item.isMember}<span class="nt-badge nt-badge-member">member</span>{/if}
					<span class="nt-faint" title={item.createdAt}>{timeAgo(item.createdAt)}</span>
				</div>
				<div class="body"><MentionText text={item.body} mentions={item.mentions} /></div>
				{#if item.elementTag}
					<div class="element nt-mono" title={item.elementSelector ?? ''}>
						&lt;{item.elementTag}&gt;{item.elementText ? ` "${item.elementText.slice(0, 60)}${item.elementText.length > 60 ? '…' : ''}"` : ''}
					</div>
				{/if}
				{#if screenshotUrl}
					<button class="shot" type="button" onclick={() => (screenshotOpen = !screenshotOpen)} title="Toggle screenshot">
						<img src={screenshotUrl} alt="Screenshot" class:open={screenshotOpen} />
					</button>
				{/if}
			</div>

			{#each item.comments as comment (comment.id)}
				<div class="message">
					<div class="meta">
						<span class="author">{comment.authorName ?? 'Anonymous'}</span>
						{#if comment.isAdmin}<span class="nt-badge nt-badge-admin">admin</span>{:else if comment.isMember}<span class="nt-badge nt-badge-member">member</span>{/if}
						<span class="nt-faint" title={comment.createdAt}>{timeAgo(comment.createdAt)}</span>
					</div>
					<div class="body"><MentionText text={comment.body} mentions={comment.mentions} /></div>
				</div>
			{/each}
		</div>

		{#if error}<div class="nt-error">{error}</div>{/if}

		{#if c.canReply}
			<form class="reply" onsubmit={sendReply}>
				<MentionTextarea
					bind:value={replyBody}
					bind:mentions={replyMentions}
					candidates={ui.mentionCandidates}
					class="nt-textarea"
					placement="up"
					onkeydown={onKeydown}
					placeholder={ui.mentionCandidates.length ? 'Reply… type @ to mention someone' : 'Reply…'}
					rows={2}
					maxlength={5000}
					disabled={busy}
				/>
				{#if !ui.viewer && !c.config.user?.name}
					<div class="identity">
						<input class="nt-input" bind:value={name} placeholder="Your name (optional)" maxlength="120" disabled={busy} />
						<input class="nt-input" type="email" bind:value={email} placeholder="Email (optional)" maxlength="254" disabled={busy} />
					</div>
				{/if}
				{#if c.needsTurnstile && ui.turnstileSiteKey}
					<Turnstile bind:this={turnstile} siteKey={ui.turnstileSiteKey} action="reply" bind:token={turnstileToken} bind:failed={turnstileFailed} />
				{/if}
				<div class="foot">
					<span class="admin-actions">
						{#if c.isAdmin}
							<button class="nt-btn nt-btn-sm" type="button" onclick={toggleStatus} disabled={busy}>
								<Icon name={item.status === 'open' ? 'check' : 'refresh'} size={13} />
								{item.status === 'open' ? 'Resolve' : 'Reopen'}
							</button>
							<button class="nt-icon-btn" type="button" onclick={remove} disabled={busy} title="Delete" aria-label="Delete feedback">
								<Icon name="trash" />
							</button>
						{/if}
					</span>
					<button class="nt-btn nt-btn-primary nt-btn-sm" type="submit" disabled={!canReplyNow}>
						{waitingForToken && replyBody.trim() ? 'Verifying…' : 'Reply'}
					</button>
				</div>
			</form>
		{:else if c.isAdmin}
			<div class="foot">
				<button class="nt-btn nt-btn-sm" type="button" onclick={toggleStatus} disabled={busy}>
					{item.status === 'open' ? 'Resolve' : 'Reopen'}
				</button>
			</div>
		{/if}
	{/if}
</section>

<style>
	.thread {
		position: fixed;
		z-index: 31;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 10px;
		max-height: min(70vh, 560px);
		animation: nt-fade-in 0.15s ease;
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.title {
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}
	.head-actions {
		display: inline-flex;
		align-items: center;
		gap: 2px;
	}
	.scroll {
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-height: 0;
		overscroll-behavior: contain;
	}
	.message {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 8px 10px;
		border-radius: var(--nt-radius-sm);
		background: var(--nt-bg-2);
	}
	.message.root {
		background: var(--nt-accent-soft);
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		font-size: 11.5px;
	}
	.author {
		font-weight: 600;
	}
	.body {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.element {
		color: var(--nt-text-2);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.shot {
		padding: 0;
		border: 1px solid var(--nt-border);
		border-radius: 4px;
		background: var(--nt-bg);
		overflow: hidden;
		line-height: 0;
	}
	.shot img {
		width: 100%;
		max-height: 90px;
		object-fit: cover;
		object-position: top;
		transition: max-height 0.2s;
	}
	.shot img.open {
		max-height: 60vh;
		object-fit: contain;
	}
	.reply {
		display: flex;
		flex-direction: column;
		gap: 6px;
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
	.admin-actions {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
</style>
