<script lang="ts">
	import FeedbackFilters from '$lib/components/FeedbackFilters.svelte';
	import FeedbackList from '$lib/components/FeedbackList.svelte';
	import Pagination from '$lib/components/Pagination.svelte';

	let { data, form } = $props();
</script>

<svelte:head>
	<title>{data.project.name} · Notette</title>
</svelte:head>

<div class="card">
	<div class="card-header">
		<FeedbackFilters status={data.filters.status} q={data.filters.q} total={data.total} />
	</div>
	{#if form?.action === 'bulk' && form.error}
		<div class="form-error" style="margin: 12px 18px 0">{form.error}</div>
	{:else if form?.action === 'bulk' && form.success}
		<div class="form-success" style="margin: 12px 18px 0">
			{form.count} {form.count === 1 ? 'item' : 'items'} {form.op === 'delete' ? 'deleted' : form.op === 'resolve' ? 'resolved' : 'reopened'}.
		</div>
	{/if}
	<FeedbackList
		items={data.items}
		selectable
		emptyTitle={data.filters.q || data.filters.status !== 'open' ? 'No matching feedback' : 'No open feedback'}
		emptyText={data.project.allowedOrigins.length === 0
			? 'Add your site to the allowed origins and embed the widget to start collecting feedback.'
			: 'Feedback submitted through the widget will show up here.'}
	/>
	<Pagination total={data.total} pageSize={data.pageSize} current={data.page} />
</div>
