<script lang="ts">
	import { page } from '$app/state';

	let { data, children } = $props();
	const base = $derived(`/projects/${data.project.id}`);
	const path = $derived(page.url.pathname);
	const isFeedbackDetail = $derived(path.startsWith(`${base}/feedback/`));
</script>

<div class="container stack">
	{#if !isFeedbackDetail}
		<div class="page-header" style="margin-bottom: 0">
			<div>
				<h1>{data.project.name}</h1>
				<p class="subtitle">
					{data.project.openCount} open · {data.project.resolvedCount} resolved
					{#if data.project.allowedOrigins.length === 0}
						· <a href="{base}/settings">configure allowed origins</a>
					{/if}
				</p>
			</div>
		</div>
		<nav class="tabs" aria-label="Project sections">
			<a class="tab" class:active={path === base} href={base}>Feedback</a>
			<a class="tab" class:active={path === `${base}/settings`} href="{base}/settings">Settings &amp; embed</a>
			<a class="tab" class:active={path === `${base}/try`} href="{base}/try">Try it</a>
		</nav>
	{/if}
	{@render children()}
</div>
