<script lang="ts">
	/**
	 * Textarea with an @-mention picker. Shared by the dashboard and the widget:
	 * styling comes from the `class` prop (`textarea` / `nt-textarea`) and the
	 * suggestion list uses CSS variables from either design system with
	 * plain fallbacks. `mentions` reflects the mentions still present in the
	 * text (picked and not deleted since); the parent sends their ids.
	 */
	import { tick } from 'svelte';
	import {
		activeMentions,
		filterMentionCandidates,
		findMentionQuery,
		insertMention,
		type MentionCandidateDto,
		type MentionQuery,
		type MentionRef
	} from '$lib/shared/mentions';

	interface Props {
		value?: string;
		mentions?: MentionRef[];
		candidates?: readonly MentionCandidateDto[];
		class?: string;
		id?: string;
		name?: string;
		placeholder?: string;
		rows?: number;
		maxlength?: number;
		required?: boolean;
		disabled?: boolean;
		/** Where the suggestion list opens relative to the textarea. */
		placement?: 'up' | 'down';
		onkeydown?: (event: KeyboardEvent) => void;
	}

	let {
		value = $bindable(''),
		mentions = $bindable([]),
		candidates = [],
		class: className = '',
		placement = 'down',
		onkeydown,
		...rest
	}: Props = $props();

	let textarea = $state<HTMLTextAreaElement | null>(null);
	/** Every mention inserted through the picker; filtered against the text on every change. */
	let tracked = $state<MentionRef[]>([]);
	let query = $state<MentionQuery | null>(null);
	let active = $state(0);

	const matches = $derived(query ? filterMentionCandidates(candidates, query.query) : []);
	const open = $derived(matches.length > 0);
	const listId = `mentions-${Math.random().toString(36).slice(2, 8)}`;

	$effect(() => {
		mentions = activeMentions(value, tracked);
	});

	function refresh() {
		if (!textarea || !candidates.length) {
			query = null;
			return;
		}
		const next = findMentionQuery(value, textarea.selectionStart ?? value.length);
		if (next?.start !== query?.start) active = 0;
		query = next;
		if (active >= matches.length) active = 0;
	}

	async function choose(candidate: MentionCandidateDto) {
		if (!query || !textarea) return;
		const result = insertMention(value, query.start, textarea.selectionStart ?? value.length, candidate);
		value = result.text;
		tracked = [...tracked, { id: candidate.id, name: candidate.name }];
		query = null;
		await tick();
		textarea.focus();
		textarea.setSelectionRange(result.caret, result.caret);
	}

	function onKey(event: KeyboardEvent) {
		if (open && !event.ctrlKey && !event.metaKey) {
			if (event.key === 'ArrowDown') {
				event.preventDefault();
				active = (active + 1) % matches.length;
				return;
			}
			if (event.key === 'ArrowUp') {
				event.preventDefault();
				active = (active - 1 + matches.length) % matches.length;
				return;
			}
			if (event.key === 'Enter' || event.key === 'Tab') {
				event.preventDefault();
				void choose(matches[active] ?? matches[0]);
				return;
			}
			if (event.key === 'Escape') {
				event.preventDefault();
				event.stopPropagation();
				query = null;
				return;
			}
		}
		onkeydown?.(event);
	}

	function onKeyUp(event: KeyboardEvent) {
		if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) refresh();
	}

	export function focus(): void {
		textarea?.focus();
	}
</script>

<div class="mention-wrap">
	<textarea
		bind:this={textarea}
		bind:value
		class={className}
		oninput={refresh}
		onclick={refresh}
		onkeyup={onKeyUp}
		onkeydown={onKey}
		onblur={() => (query = null)}
		{...rest}
	></textarea>
	{#if open}
		<ul class="mention-list" class:up={placement === 'up'} id={listId} role="listbox" aria-label="Mention someone">
			{#each matches as candidate, index (candidate.id)}
				<li
					role="option"
					tabindex="-1"
					aria-selected={index === active}
					class:active={index === active}
					onmousedown={(event) => {
						event.preventDefault();
						void choose(candidate);
					}}
					onmousemove={() => (active = index)}
				>
					<span class="name">@{candidate.name}</span>
					{#if candidate.admin}<span class="role">admin</span>{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.mention-wrap {
		position: relative;
		width: 100%;
	}
	.mention-list {
		position: absolute;
		left: 0;
		right: 0;
		top: calc(100% + 4px);
		z-index: 5;
		margin: 0;
		padding: 4px;
		list-style: none;
		max-height: 200px;
		overflow-y: auto;
		background: var(--nt-bg, var(--surface, #ffffff));
		color: var(--nt-text, var(--text, #14181f));
		border: 1px solid var(--nt-border, var(--border, #dfe3e8));
		border-radius: var(--nt-radius-sm, var(--radius-sm, 6px));
		box-shadow: var(--nt-shadow, var(--shadow, 0 4px 16px rgba(16, 24, 40, 0.12)));
		font-size: 13px;
		text-align: left;
	}
	.mention-list.up {
		top: auto;
		bottom: calc(100% + 4px);
	}
	li {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 8px;
		border-radius: 4px;
		cursor: pointer;
	}
	li.active {
		background: var(--nt-accent-soft, var(--accent-soft, #eef2ff));
	}
	.name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.role {
		margin-left: auto;
		font-size: 11px;
		color: var(--nt-text-3, var(--text-3, #7b8494));
	}
</style>
