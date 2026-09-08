<script lang="ts">
	import { enhance } from '$app/forms';
	import { SvelteSet } from 'svelte/reactivity';
	import StatusBadge from './StatusBadge.svelte';
	import { confirmSubmit } from '$lib/confirm.svelte';
	import { timeAgo, truncate } from '$lib/format';
	import type { FeedbackSummaryDto } from '$lib/shared/types';

	export interface FeedbackListItem extends FeedbackSummaryDto {
		projectId: string;
		projectName: string;
	}

	interface Props {
		items: FeedbackListItem[];
		showProject?: boolean;
		emptyTitle?: string;
		emptyText?: string;
		/**
		 * Enables the checkbox column, the bulk toolbar and the per-row
		 * resolve/reopen/delete buttons. The page must expose a `bulk` form
		 * action (see `bulkFeedbackAction` in `$lib/server/feedback-bulk`).
		 */
		selectable?: boolean;
	}

	let {
		items,
		showProject = false,
		emptyTitle = 'No feedback yet',
		emptyText = 'Feedback submitted through the widget will show up here.',
		selectable = false
	}: Props = $props();

	const selected = new SvelteSet<string>();
	let lastIndex = $state<number | null>(null);

	// Drop selections for items that left the list (after an action or a page change).
	$effect(() => {
		const present = new Set(items.map((i) => i.id));
		for (const id of Array.from(selected)) {
			if (!present.has(id)) selected.delete(id);
		}
	});

	const selectedIds = $derived(items.filter((i) => selected.has(i.id)).map((i) => i.id));
	const allSelected = $derived(items.length > 0 && selectedIds.length === items.length);
	const selectedItems = $derived(items.filter((i) => selected.has(i.id)));
	const canResolve = $derived(selectedItems.some((i) => i.status === 'open'));
	const canReopen = $derived(selectedItems.some((i) => i.status === 'resolved'));

	function toggle(index: number, event: MouseEvent) {
		const item = items[index];
		const checked = (event.currentTarget as HTMLInputElement).checked;
		if (event.shiftKey && lastIndex !== null && lastIndex !== index) {
			const [from, to] = lastIndex < index ? [lastIndex, index] : [index, lastIndex];
			for (let i = from; i <= to; i += 1) {
				if (checked) selected.add(items[i].id);
				else selected.delete(items[i].id);
			}
		} else if (checked) {
			selected.add(item.id);
		} else {
			selected.delete(item.id);
		}
		lastIndex = index;
	}

	function toggleAll() {
		if (allSelected) selected.clear();
		else for (const item of items) selected.add(item.id);
		lastIndex = null;
	}

	function plural(n: number) {
		return `${n} ${n === 1 ? 'item' : 'items'}`;
	}

	const bulkSubmit = confirmSubmit(
		({ submitter }) => {
			if (!(submitter instanceof HTMLButtonElement) || submitter.value !== 'delete') return null;
			const n = selectedIds.length;
			return {
				title: `Delete ${plural(n)}?`,
				message: `${n === 1 ? 'This item' : 'These items'} and all replies and screenshots will be permanently deleted.`,
				confirmLabel: n === 1 ? 'Delete' : `Delete ${n}`
			};
		},
		() =>
			async ({ result, update }) => {
				if (result.type === 'success') {
					selected.clear();
					lastIndex = null;
				}
				await update();
			}
	);

	function rowDelete(item: FeedbackListItem) {
		return confirmSubmit({
			title: `Delete feedback #${item.number}?`,
			message: 'The item, its replies and its screenshot will be permanently deleted.',
			confirmLabel: 'Delete'
		});
	}
</script>

{#if items.length === 0}
	<div class="empty">
		<h3>{emptyTitle}</h3>
		<p>{emptyText}</p>
	</div>
{:else}
	{#if selectable}
		<div class="bulk-bar">
			<label>
				<input type="checkbox" checked={allSelected} indeterminate={selectedIds.length > 0 && !allSelected} onchange={toggleAll} />
				{allSelected ? 'Select none' : 'Select all'}
			</label>
			<span class="count">{selectedIds.length > 0 ? `${plural(selectedIds.length)} selected` : 'Shift-click to select a range'}</span>
			<span class="spacer"></span>
			{#if selectedIds.length > 0}
				<form method="POST" action="?/bulk" use:enhance={bulkSubmit}>
					<input type="hidden" name="ids" value={selectedIds.join(',')} />
					<button class="btn btn-sm" type="submit" name="op" value="resolve" disabled={!canResolve}>Resolve</button>
					<button class="btn btn-sm" type="submit" name="op" value="reopen" disabled={!canReopen}>Reopen</button>
					<button class="btn btn-sm btn-danger" type="submit" name="op" value="delete">Delete</button>
				</form>
			{/if}
		</div>
	{/if}
	<div class="feedback-list">
		{#each items as item, index (item.id)}
			<div class="feedback-item" class:selectable class:selected={selected.has(item.id)}>
				{#if selectable}
					<span class="pick">
						<input type="checkbox" checked={selected.has(item.id)} onclick={(e) => toggle(index, e)} aria-label="Select #{item.number}" />
					</span>
				{/if}
				<a class="main" href="/projects/{item.projectId}/feedback/{item.id}">
					<span class="num">#{item.number}</span>
					<span>
						<span class="body">{truncate(item.body, 220)}</span>
						<span class="meta">
							{#if showProject}<span>{item.projectName}</span>{/if}
							<span class="path" title={item.url}>{item.path}</span>
							<span>{item.authorName ?? 'Anonymous'}{item.isAdmin ? ' · admin' : item.isMember ? ' · member' : ''}</span>
							{#if item.commentCount > 0}
								<span>{item.commentCount} {item.commentCount === 1 ? 'reply' : 'replies'}</span>
							{/if}
							{#if item.hasScreenshot}<span>screenshot</span>{/if}
							{#if item.deployment?.branch}<span class="mono">{item.deployment.branch}</span>{/if}
						</span>
					</span>
					<span class="side">
						<StatusBadge status={item.status} />
						<span class="small faint" title={item.createdAt}>{timeAgo(item.createdAt)}</span>
					</span>
				</a>
				{#if selectable}
					<span class="actions">
						<form method="POST" action="?/bulk" use:enhance>
							<input type="hidden" name="ids" value={item.id} />
							<button class="btn btn-sm btn-ghost" type="submit" name="op" value={item.status === 'open' ? 'resolve' : 'reopen'}>
								{item.status === 'open' ? 'Resolve' : 'Reopen'}
							</button>
						</form>
						<form method="POST" action="?/bulk" use:enhance={rowDelete(item)}>
							<input type="hidden" name="ids" value={item.id} />
							<input type="hidden" name="op" value="delete" />
							<button class="btn btn-sm btn-ghost" type="submit" title="Delete #{item.number}">Delete</button>
						</form>
					</span>
				{/if}
			</div>
		{/each}
	</div>
{/if}
