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
			<form
				method="POST"
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
					{submitting ? 'Signing in…' : 'Sign in'}
				</button>
			</form>
		</div>
	</div>
</div>
