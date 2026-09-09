<script lang="ts">
	import { getContext } from 'svelte';
	import type { FeedbackStatus, FeedbackSummaryDto } from '$lib/shared/types';
	import { timeAgo } from '$lib/format';
	import { NotetteApiError } from '../lib/api';
	import type { WidgetController } from '../lib/controller.svelte';
	import Icon from './Icon.svelte';

	const c = getContext<WidgetController>('notette');
	const ui = c.ui;

	let scope = $state<'page' | 'project'>(c.isAdmin ? 'project' : 'page');
	let q = $state('');
	let projectItems = $state<FeedbackSummaryDto[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);

	$effect(() => {
		if (!c.isAdmin && scope === 'project') scope = 'page';
	});

	// Load project-wide items (admin only), debounced on filter changes.
	$effect(() => {
		if (scope !== 'project' || !c.isAdmin) return;
		const currentStatus = ui.statusFilter;
		const currentQ = q.trim();
		let cancelled = false;
		loading = true;
		const timer = setTimeout(async () => {
			try {
				const result = await c.api.listProject({ status: currentStatus, q: currentQ || undefined });
				if (!cancelled) {
					projectItems = result.items;
					error = null;
				}
			} catch (err) {
				if (!cancelled) error = err instanceof NotetteApiError ? err.message : 'Could not load feedback.';
			} finally {
				if (!cancelled) loading = false;
			}
		}, 200);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	});

	const items = $derived.by(() => {
		if (scope === 'project') return projectItems;
		const needle = q.trim().toLowerCase();
		return ui.pageItems.filter((i) => {
			if (ui.statusFilter !== 'all' && i.status !== ui.statusFilter) return false;
			if (!needle) return true;
			return (
				i.body.toLowerCase().includes(needle) ||
				(i.authorName ?? '').toLowerCase().includes(needle) ||
				`#${i.number}`.includes(needle)
			);
		});
	});

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.stopPropagation();
			c.closePanel();
		}
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<aside class="panel nt-card" aria-label="Feedback list" onkeydown={onKeydown}>
	<div class="head">
		<div class="title">
			<strong>{ui.project?.name ?? 'Feedback'}</strong>
			<span class="nt-faint nt-small">{items.length} {items.length === 1 ? 'item' : 'items'}</span>
		</div>
		<button class="nt-icon-btn" type="button" onclick={() => c.closePanel()} aria-label="Close list"><Icon name="close" /></button>
	</div>

	<div class="filters">
		{#if c.isAdmin}
			<div class="segment" role="tablist">
				<button type="button" role="tab" class:active={scope === 'project'} aria-selected={scope === 'project'} onclick={() => (scope = 'project')}>All pages</button>
				<button type="button" role="tab" class:active={scope === 'page'} aria-selected={scope === 'page'} onclick={() => (scope = 'page')}>This page</button>
			</div>
		{/if}
		<select
			class="nt-select"
			value={ui.statusFilter}
			onchange={(e) => c.setStatusFilter(e.currentTarget.value as FeedbackStatus | 'all')}
			aria-label="Status"
		>
			<option value="open">Open</option>
			<option value="resolved">Resolved</option>
			<option value="all">All</option>
		</select>
	</div>
	<div class="search">
		<Icon name="search" size={14} />
		<input class="nt-input" type="search" bind:value={q} placeholder="Search…" aria-label="Search feedback" />
	</div>

	<div class="list">
		{#if error}
			<div class="nt-error">{error}</div>
		{:else if loading && items.length === 0}
			<div class="empty nt-faint">Loading…</div>
		{:else if items.length === 0}
			<div class="empty nt-faint">
				{#if scope === 'page' && !c.isAdmin && q === '' && ui.statusFilter === 'open'}
					No open feedback on this page yet.
				{:else}
					Nothing matches.
				{/if}
			</div>
		{:else}
			{#each items as item (item.id)}
				<button
					class="item"
					class:selected={ui.selectedId === item.id}
					type="button"
					onclick={() => void c.focusItem(item.id, item)}
				>
					<span class="num" class:resolved={item.status === 'resolved'}>{item.number}</span>
					<span class="content">
						<span class="body">{item.body}</span>
						<span class="meta">
							{#if item.path !== ui.currentPath}<span class="path nt-mono" title={item.url}>{item.path}</span>{/if}
							<span>{item.authorName ?? 'Anonymous'}</span>
							<span title={item.createdAt}>{timeAgo(item.createdAt)}</span>
							{#if item.commentCount > 0}<span>{item.commentCount} {item.commentCount === 1 ? 'reply' : 'replies'}</span>{/if}
						</span>
					</span>
				</button>
			{/each}
		{/if}
	</div>
</aside>

<style>
	.panel {
		position: fixed;
		top: 12px;
		right: 12px;
		bottom: 84px;
		z-index: 40;
		width: min(360px, calc(100vw - 24px));
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px;
		animation: nt-fade-in 0.15s ease;
	}
	:global(.launcher.left) ~ .panel,
	:global(.nt-root[data-position='bottom-left']) .panel {
		right: auto;
		left: 12px;
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.title {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.title strong {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.filters {
		display: flex;
		gap: 6px;
		align-items: center;
	}
	.filters .nt-select {
		width: auto;
		margin-left: auto;
		padding: 4px 8px;
		font-size: 12px;
	}
	.segment {
		display: inline-flex;
		padding: 2px;
		border-radius: var(--nt-radius-sm);
		background: var(--nt-bg-2);
	}
	.segment button {
		padding: 3px 9px;
		border: none;
		border-radius: 4px;
		background: transparent;
		color: var(--nt-text-2);
		font-size: 12px;
		font-weight: 500;
	}
	.segment button.active {
		background: var(--nt-bg);
		color: var(--nt-text);
		box-shadow: var(--nt-shadow-sm);
	}
	.search {
		position: relative;
		color: var(--nt-text-3);
	}
	.search :global(svg) {
		position: absolute;
		left: 9px;
		top: 50%;
		transform: translateY(-50%);
		pointer-events: none;
	}
	.search .nt-input {
		padding-left: 28px;
		padding-top: 5px;
		padding-bottom: 5px;
	}
	.list {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin: 0 -4px;
		padding: 0 4px;
		overscroll-behavior: contain;
	}
	.empty {
		padding: 24px 8px;
		text-align: center;
	}
	.item {
		display: grid;
		grid-template-columns: 30px minmax(0, 1fr);
		gap: 8px;
		padding: 8px;
		border: 1px solid transparent;
		border-radius: var(--nt-radius-sm);
		background: transparent;
		text-align: left;
		width: 100%;
	}
	.item:hover {
		background: var(--nt-bg-2);
	}
	.item.selected {
		border-color: var(--nt-accent);
		background: var(--nt-accent-soft);
	}
	.num {
		width: 26px;
		height: 26px;
		border-radius: 50%;
		background: var(--nt-accent);
		color: #fff;
		font-size: 11px;
		font-weight: 700;
		display: grid;
		place-items: center;
	}
	.num.resolved {
		background: var(--nt-success);
	}
	.content {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.body {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		overflow-wrap: anywhere;
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 2px 8px;
		font-size: 11px;
		color: var(--nt-text-3);
	}
	.path {
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--nt-text-2);
	}
</style>
