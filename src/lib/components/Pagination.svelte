<script lang="ts">
	import { page } from '$app/state';

	interface Props {
		total: number;
		pageSize: number;
		current: number;
	}

	let { total, pageSize, current }: Props = $props();
	const pages = $derived(Math.max(1, Math.ceil(total / pageSize)));

	function href(n: number): string {
		const url = new URL(page.url);
		url.searchParams.set('page', String(n));
		return url.pathname + url.search;
	}
</script>

{#if pages > 1}
	<div class="pagination">
		<span>Page {current} of {pages}</span>
		<span class="row">
			{#if current > 1}
				<a class="btn btn-sm" href={href(current - 1)}>Previous</a>
			{/if}
			{#if current < pages}
				<a class="btn btn-sm" href={href(current + 1)}>Next</a>
			{/if}
		</span>
	</div>
{/if}
