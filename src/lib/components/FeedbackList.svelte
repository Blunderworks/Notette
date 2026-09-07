<script lang="ts">
	import StatusBadge from './StatusBadge.svelte';
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
	}

	let {
		items,
		showProject = false,
		emptyTitle = 'No feedback yet',
		emptyText = 'Feedback submitted through the widget will show up here.'
	}: Props = $props();
</script>

{#if items.length === 0}
	<div class="empty">
		<h3>{emptyTitle}</h3>
		<p>{emptyText}</p>
	</div>
{:else}
	<div class="feedback-list">
		{#each items as item (item.id)}
			<a class="feedback-item" href="/projects/{item.projectId}/feedback/{item.id}">
				<span class="num">#{item.number}</span>
				<span>
					<span class="body">{truncate(item.body, 220)}</span>
					<span class="meta">
						{#if showProject}<span>{item.projectName}</span>{/if}
						<span class="path" title={item.url}>{item.path}</span>
						<span>{item.authorName ?? 'Anonymous'}{item.isAdmin ? ' · admin' : ''}</span>
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
		{/each}
	</div>
{/if}
