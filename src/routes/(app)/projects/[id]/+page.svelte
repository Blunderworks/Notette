<script lang="ts">
	import FeedbackFilters from '$lib/components/FeedbackFilters.svelte';
	import FeedbackList from '$lib/components/FeedbackList.svelte';
	import Pagination from '$lib/components/Pagination.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>{data.project.name} · Notette</title>
</svelte:head>

<div class="card">
	<div class="card-header">
		<FeedbackFilters status={data.filters.status} q={data.filters.q} total={data.total} />
	</div>
	<FeedbackList
		items={data.items}
		emptyTitle={data.filters.q || data.filters.status !== 'open' ? 'No matching feedback' : 'No open feedback'}
		emptyText={data.project.allowedOrigins.length === 0
			? 'Add your site to the allowed origins and embed the widget to start collecting feedback.'
			: 'Feedback submitted through the widget will show up here.'}
	/>
	<Pagination total={data.total} pageSize={data.pageSize} current={data.page} />
</div>
