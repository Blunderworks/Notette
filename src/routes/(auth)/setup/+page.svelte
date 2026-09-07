<script lang="ts">
	import { enhance } from '$app/forms';

	let { form } = $props();
</script>

<svelte:head>
	<title>Set up Notette</title>
</svelte:head>

<div class="auth-page">
	<div class="card auth-card">
		<div class="card-body stack">
			<div class="row">
				<span class="brand-mark">N</span>
				<h1>Welcome to Notette</h1>
			</div>
			<p class="muted">Create the first administrator account. You can add more users later.</p>
			{#if form?.error}
				<div class="form-error">{form.error}</div>
			{/if}
			<form method="POST" class="stack" use:enhance>
				<div class="field">
					<label class="label" for="name">Name</label>
					<input class="input" id="name" name="name" required value={form?.name ?? ''} />
				</div>
				<div class="field">
					<label class="label" for="email">Email</label>
					<input class="input" id="email" name="email" type="email" autocomplete="username" required value={form?.email ?? ''} />
				</div>
				<div class="field">
					<label class="label" for="password">Password</label>
					<input class="input" id="password" name="password" type="password" autocomplete="new-password" minlength="10" required />
					<span class="help">At least 10 characters.</span>
				</div>
				<div class="field">
					<label class="label" for="confirm">Confirm password</label>
					<input class="input" id="confirm" name="confirm" type="password" autocomplete="new-password" required />
				</div>
				<button class="btn btn-primary btn-block" type="submit">Create account</button>
			</form>
		</div>
	</div>
</div>
