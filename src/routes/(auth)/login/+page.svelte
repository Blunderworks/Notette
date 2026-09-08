<script lang="ts">
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';
	import { loadTurnstile, type TurnstileApi } from '$lib/shared/turnstile-client';

	let { data, form } = $props();
	let submitting = $state(false);
	let turnstileToken = $state('');
	let turnstileFailed = $state(false);
	let turnstileContainer = $state<HTMLDivElement | null>(null);
	let turnstileApi: TurnstileApi | null = null;
	let turnstileId: string | null = null;

	const needsTurnstile = $derived(!!data.turnstileSiteKey);
	const canSubmit = $derived(!submitting && (!needsTurnstile || !!turnstileToken));

	// Explicit rendering keeps the challenge working across client-side navigations.
	onMount(() => {
		const siteKey = data.turnstileSiteKey;
		if (!siteKey || !turnstileContainer) return;
		let cancelled = false;
		loadTurnstile()
			.then((api) => {
				if (cancelled || !turnstileContainer) return;
				turnstileApi = api;
				turnstileId = api.render(turnstileContainer, {
					sitekey: siteKey,
					appearance: 'interaction-only',
					size: 'flexible',
					action: 'login',
					callback: (token) => (turnstileToken = token),
					'expired-callback': () => (turnstileToken = ''),
					'timeout-callback': () => (turnstileToken = ''),
					'error-callback': (code) => {
						console.warn('[notette] Turnstile error', code ?? 'unknown');
						turnstileToken = '';
						turnstileFailed = true;
						return true;
					}
				});
			})
			.catch(() => (turnstileFailed = true));
		return () => {
			cancelled = true;
			if (turnstileApi && turnstileId) {
				try {
					turnstileApi.remove(turnstileId);
				} catch {
					/* already gone */
				}
			}
		};
	});

	function resetTurnstile() {
		turnstileToken = '';
		if (turnstileApi && turnstileId) {
			try {
				turnstileApi.reset(turnstileId);
			} catch {
				/* ignore */
			}
		}
	}
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
						// Turnstile tokens are single-use; a failed attempt needs a fresh one.
						resetTurnstile();
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
				{#if needsTurnstile}
					<input type="hidden" name="cf-turnstile-response" value={turnstileToken} />
					<div class="turnstile" bind:this={turnstileContainer}></div>
					{#if turnstileFailed}
						<div class="form-error">The verification challenge could not load. Reload the page and try again.</div>
					{/if}
				{/if}
				<button class="btn btn-primary btn-block" type="submit" disabled={!canSubmit}>
					{#if submitting}Signing in…{:else if needsTurnstile && !turnstileToken && !turnstileFailed}Verifying…{:else}Sign in{/if}
				</button>
			</form>
		</div>
	</div>
</div>

<style>
	.turnstile:empty {
		display: none;
	}
</style>
