<script lang="ts">
	import { page } from '$app/state';
</script>

<svelte:head>
	<title>{page.status} · Notette</title>
</svelte:head>

<div class="auth-page">
	<div class="card auth-card">
		<div class="card-body stack">
			<h1>{page.status}</h1>
			<p class="muted">{page.error?.message ?? 'Something went wrong.'}</p>
			<a class="btn" href="/">Back to dashboard</a>
		</div>
	</div>
</div>
