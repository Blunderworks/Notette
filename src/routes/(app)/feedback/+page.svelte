<script lang="ts">
	import FeedbackFilters from '$lib/components/FeedbackFilters.svelte';
	import FeedbackList from '$lib/components/FeedbackList.svelte';
	import Pagination from '$lib/components/Pagination.svelte';

	let { data, form } = $props();
</script>

<svelte:head>
	<title>All feedback · Notette</title>
</svelte:head>

<div class="container stack">
	<div class="page-header">
		<div>
			<h1>All feedback</h1>
			<p class="subtitle">Search and triage feedback across every project.</p>
		</div>
	</div>

	<div class="card">
		<div class="card-header">
			<FeedbackFilters
				status={data.filters.status}
				q={data.filters.q}
				projects={data.projects}
				projectId={data.filters.projectId}
				total={data.total}
			/>
		</div>
		{#if form?.action === 'bulk' && form.error}
			<div class="form-error" style="margin: 12px 18px 0">{form.error}</div>
		{:else if form?.action === 'bulk' && form.success}
			<div class="form-success" style="margin: 12px 18px 0">
				{form.count} {form.count === 1 ? 'item' : 'items'} {form.op === 'delete' ? 'deleted' : form.op === 'resolve' ? 'resolved' : 'reopened'}.
			</div>
		{/if}
		<FeedbackList items={data.items} showProject selectable emptyTitle="No matching feedback" emptyText="Try a different filter or search term." />
		<Pagination total={data.total} pageSize={data.pageSize} current={data.page} />
	</div>
</div>
