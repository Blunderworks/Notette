<script lang="ts">
	/** Renders a body with its @-mentions highlighted. Shared by the dashboard and the widget. */
	import { segmentMentions } from '$lib/shared/mentions';

	let { text, mentions = [] }: { text: string; mentions?: readonly string[] } = $props();
	const segments = $derived(segmentMentions(text, mentions));
</script>

{#each segments as segment, index (index)}{#if segment.mention}<span class="mention">{segment.text}</span>{:else}{segment.text}{/if}{/each}

<style>
	.mention {
		color: var(--nt-accent, var(--accent-text, #3730a3));
		font-weight: 600;
	}
</style>
