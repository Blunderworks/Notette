<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();
	let closing = $state(false);

	function tryClose() {
		closing = true;
		setTimeout(() => window.close(), 800);
	}

	$effect(() => {
		if (form?.approved || form?.denied) tryClose();
	});
</script>

<svelte:head>
	<title>Authorize widget · Notette</title>
</svelte:head>

<div class="row">
	<span class="brand-mark">N</span>
	<h1>Widget admin access</h1>
</div>

{#if form?.approved}
	<div class="form-success">Access granted. You can close this window and return to the site.</div>
	{#if closing}<p class="small faint">Closing…</p>{/if}
{:else if form?.denied}
	<div class="notice">Request denied. You can close this window.</div>
{:else if data.state === 'pending' && data.project}
	<p>
		The Notette widget on <strong class="mono">{data.origin}</strong> is asking for admin access to the project
		<strong>{data.project.name}</strong>.
	</p>
	<p class="muted small">
		Approving lets that browser resolve, reopen and browse all feedback for the project as
		<strong>{data.user.name}</strong> ({data.user.email}). The access token is stored only in the site's browser
		storage and can be revoked under Account → Sessions.
	</p>
	{#if form?.error}<div class="form-error">{form.error}</div>{/if}
	<div class="form-actions">
		<form method="POST" action="?/approve" use:enhance>
			<input type="hidden" name="request" value={data.requestId} />
			<button class="btn btn-primary" type="submit">Approve</button>
		</form>
		<form method="POST" action="?/deny" use:enhance>
			<input type="hidden" name="request" value={data.requestId} />
			<button class="btn" type="submit">Deny</button>
		</form>
	</div>
{:else if data.state === 'expired'}
	<div class="notice">This sign-in request has expired. Close this window and start again from the widget.</div>
{:else if data.state === 'approved'}
	<div class="form-success">This request was already approved. You can close this window.</div>
{:else if data.state === 'denied'}
	<div class="notice">This request was denied. Close this window and start again from the widget.</div>
{:else}
	<div class="form-error">Unknown sign-in request. Close this window and try again from the widget.</div>
{/if}

<a class="small faint" href="/">Go to dashboard</a>
