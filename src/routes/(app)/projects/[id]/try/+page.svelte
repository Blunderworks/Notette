<script lang="ts">
	import { enhance } from '$app/forms';

	let { data } = $props();
	const project = $derived(data.project);
	let loaded = $state(false);

	// Re-runs when the origin gets allowed (after the "Allow" action) so no reload is needed.
	$effect(() => {
		const allowed = data.selfAllowed;
		const key = project.clientKey;
		if (!allowed) return;
		const script = document.createElement('script');
		script.src = `${data.origin}/notette.js`;
		script.async = true;
		script.dataset.key = key;
		script.dataset.environment = 'playground';
		script.dataset.deploymentUrl = data.origin;
		script.onload = () => (loaded = true);
		document.body.appendChild(script);
		return () => {
			(window as unknown as { Notette?: { destroy?: () => void } }).Notette?.destroy?.();
			script.remove();
			loaded = false;
		};
	});
</script>

<svelte:head>
	<title>Try it · {project.name} · Notette</title>
</svelte:head>

<div class="stack">
	{#if !data.selfAllowed}
		<div class="card">
			<div class="card-body stack">
				<h2>Enable the playground</h2>
				<p class="muted">
					This page loads the real widget for <strong>{project.name}</strong> so you can try leaving feedback
					without deploying anything. To do that, <code class="inline">{data.origin}</code> must be one of the
					project's allowed origins.
				</p>
				<form method="POST" action="?/allowSelf" use:enhance>
					<button class="btn btn-primary" type="submit">Allow {data.origin}</button>
				</form>
			</div>
		</div>
	{:else}
		<div class="notice">
			The widget is live on this page{loaded ? '' : ' (loading…)'}. Use the launcher in the bottom-right corner:
			click <strong>Comment</strong>, then click any element below to leave feedback. Choose <strong>Sign in</strong> in
			the launcher with your admin account to resolve items and browse the whole project.
			{#if !project.anonymousFeedbackAllowed}
				This project does not allow anonymous feedback, so the launcher opens the sign-in form first.
			{/if}
		</div>

		<section class="card" id="demo-hero">
			<div class="card-body stack">
				<h2>Acme Dashboard</h2>
				<p class="muted">A sample page with a few interactive elements for you to comment on.</p>
				<div class="row">
					<button class="btn btn-primary" type="button" id="demo-primary">Create report</button>
					<button class="btn" type="button" id="demo-secondary">Export CSV</button>
					<button class="btn btn-ghost" type="button">Settings</button>
				</div>
			</div>
		</section>

		<div class="grid">
			{#each [['Monthly active users', '12,480', '+4.2%'], ['Conversion rate', '3.9%', '-0.3%'], ['Open tickets', '27', '+6']] as [label, value, delta]}
				<div class="card">
					<div class="card-body stat">
						<span class="label">{label}</span>
						<span class="value">{value}</span>
						<span class="small faint">{delta} vs last month</span>
					</div>
				</div>
			{/each}
		</div>

		<div class="card">
			<div class="card-header"><h2>Recent orders</h2></div>
			<div class="table-wrap">
				<table class="table">
					<thead>
						<tr><th>Order</th><th>Customer</th><th>Status</th><th>Total</th></tr>
					</thead>
					<tbody>
						<tr><td class="mono">#1042</td><td>Ada Lovelace</td><td><span class="badge open">Processing</span></td><td>$129.00</td></tr>
						<tr><td class="mono">#1041</td><td>Grace Hopper</td><td><span class="badge resolved">Shipped</span></td><td>$58.50</td></tr>
						<tr><td class="mono">#1040</td><td>Alan Turing</td><td><span class="badge neutral">Cancelled</span></td><td>$0.00</td></tr>
					</tbody>
				</table>
			</div>
		</div>

		<div class="card">
			<div class="card-header"><h2>Contact form</h2></div>
			<div class="card-body stack" style="max-width: 480px">
				<div class="field">
					<label class="label" for="demo-name">Name</label>
					<input class="input" id="demo-name" placeholder="Jane Doe" />
				</div>
				<div class="field">
					<label class="label" for="demo-message">Message</label>
					<textarea class="textarea" id="demo-message" placeholder="How can we help?"></textarea>
				</div>
				<div><button class="btn btn-primary" type="button">Send message</button></div>
			</div>
		</div>
	{/if}
</div>
