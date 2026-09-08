<script lang="ts">
	let { data } = $props();
	const site = $derived.by(() => {
		if (!data.origin) return null;
		try {
			return new URL(data.origin).host;
		} catch {
			return data.origin;
		}
	});
</script>

<svelte:head>
	<title>Confirm email · Notette</title>
</svelte:head>

<div class="auth-page">
	<div class="card auth-card">
		<div class="card-body stack">
			<div class="row">
				<span class="brand-mark">N</span>
				<h1>Email confirmation</h1>
			</div>
			{#if data.status === 'verified'}
				<div class="form-success">Thanks{data.name ? `, ${data.name}` : ''}! Your email address is confirmed.</div>
				<p class="muted">Go back to the site and sign in from the feedback widget with your email and password.</p>
			{:else if data.status === 'already_verified'}
				<div class="form-success">This email address was already confirmed. You can sign in from the feedback widget.</div>
			{:else if data.status === 'expired'}
				<div class="notice">
					This confirmation link has expired. Open the sign-in form in the feedback widget, enter your email and
					choose <strong>Resend confirmation email</strong> to get a new one.
				</div>
			{:else}
				<div class="form-error">This confirmation link is invalid or was already used.</div>
			{/if}
			{#if data.origin && site && (data.status === 'verified' || data.status === 'already_verified')}
				<a class="btn btn-primary" href={data.origin} rel="noopener">Back to {site}</a>
			{/if}
			<a class="small faint" href="/">Go to dashboard</a>
		</div>
	</div>
</div>
