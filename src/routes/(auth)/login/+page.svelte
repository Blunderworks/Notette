<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();
	let submitting = $state(false);
</script>

<svelte:head>
	<title>Sign in · Notette</title>
</svelte:head>

<div class="auth-page">
	<div class="card auth-card">
		<div class="card-body stack">
			<div class="row">
				<span class="brand-mark">N</span>
				<h1>Sign in to Notette</h1>
			</div>
			{#if form?.error}
				<div class="form-error">{form.error}</div>
			{/if}
			{#if form?.resent}
				<div class="form-success">If that account still needs confirmation, a new link is on its way to {form.email}.</div>
			{/if}
			{#if form?.unverified}
				<form method="POST" action="?/resend" class="row" use:enhance>
					<input type="hidden" name="email" value={form.email ?? ''} />
					<button class="btn btn-sm" type="submit">Resend confirmation email</button>
				</form>
			{/if}
			<form
				method="POST"
				action="?/login"
				class="stack"
				use:enhance={() => {
					submitting = true;
					return async ({ update }) => {
						submitting = false;
						await update();
					};
				}}
			>
				<input type="hidden" name="redirect" value={data.redirectTo} />
				<div class="field">
					<label class="label" for="email">Email</label>
					<input class="input" id="email" name="email" type="email" autocomplete="username" required value={form?.email ?? ''} />
				</div>
				<div class="field">
					<label class="label" for="password">Password</label>
					<input class="input" id="password" name="password" type="password" autocomplete="current-password" required />
				</div>
				<button class="btn btn-primary btn-block" type="submit" disabled={submitting}>
					{#if submitting}Signing in…{:else}Sign in{/if}
				</button>
			</form>
		</div>
	</div>
</div>
