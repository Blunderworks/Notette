<script lang="ts">
	import { getContext } from 'svelte';
	import { NotetteApiError } from '../lib/api';
	import type { AuthMode, WidgetController } from '../lib/controller.svelte';
	import Icon from './Icon.svelte';
	import Turnstile from './Turnstile.svelte';

	const c = getContext<WidgetController>('notette');
	const ui = c.ui;
	const auth = $derived(ui.auth);
	const signupAvailable = $derived(!!ui.project?.openSignups);
	const title = $derived(
		auth.status === 'verify' ? 'Check your inbox' : auth.status === 'form' && auth.mode === 'signup' ? 'Create an account' : 'Sign in'
	);

	let name = $state('');
	let email = $state(c.getAuthor().email);
	let password = $state('');
	let busy = $state(false);
	let error = $state<string | null>(null);
	let turnstileToken = $state<string | null>(null);
	let turnstileFailed = $state(false);
	let turnstile = $state<ReturnType<typeof Turnstile> | null>(null);
	/** Set when sign-in failed because the address is not confirmed yet; offers a resend. */
	let unverifiedEmail = $state<string | null>(null);
	let resending = $state(false);

	async function resend(address: string) {
		resending = true;
		try {
			await c.resendVerification(address);
		} finally {
			resending = false;
		}
	}

	function backToSignIn() {
		if (ui.verifyEmail) email = ui.verifyEmail;
		unverifiedEmail = null;
		c.openSignIn('login');
	}

	const needsToken = $derived(!!ui.turnstileSiteKey);
	const canSubmit = $derived(!busy && (!needsToken || !!turnstileToken));

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (!canSubmit) return;
		busy = true;
		error = null;
		unverifiedEmail = null;
		const token = turnstileToken ?? undefined;
		try {
			if (auth.mode === 'signup') {
				await c.signUp({ name, email, password, turnstileToken: token });
			} else {
				await c.signInWithPassword({ email, password, turnstileToken: token });
			}
			password = '';
		} catch (err) {
			error = err instanceof NotetteApiError ? err.message : 'Could not sign in. Please try again.';
			if (err instanceof NotetteApiError && err.code === 'email_unverified') unverifiedEmail = email;
			// Turnstile tokens are single-use; get a fresh one for the next attempt.
			turnstile?.reset();
		} finally {
			busy = false;
		}
	}

	function switchMode(mode: AuthMode) {
		error = null;
		c.setAuthMode(mode);
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.stopPropagation();
			c.cancelSignIn();
		}
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="dialog nt-card" role="dialog" aria-label={title} tabindex="-1" onkeydown={onKeydown}>
	<div class="head">
		<strong>{title}</strong>
		<button class="nt-icon-btn" type="button" onclick={() => c.cancelSignIn()} aria-label="Close"><Icon name="close" /></button>
	</div>
	{#if auth.status === 'form'}
		{#if c.requiresSignIn}
			<p class="nt-muted">
				{#if auth.mode === 'signup'}Create an account to leave feedback on this site.{:else}Sign in to leave feedback on this site.{/if}
			</p>
		{/if}
		<form class="form" onsubmit={submit}>
			{#if auth.mode === 'signup'}
				<input class="nt-input" type="text" bind:value={name} placeholder="Your name" required maxlength="120" autocomplete="name" disabled={busy} />
			{/if}
			<input class="nt-input" type="email" bind:value={email} placeholder="Email" required maxlength="254" autocomplete="username" disabled={busy} />
			<input
				class="nt-input"
				type="password"
				bind:value={password}
				placeholder={auth.mode === 'signup' ? 'Password (at least 10 characters)' : 'Password'}
				required
				minlength={auth.mode === 'signup' ? 10 : undefined}
				maxlength="200"
				autocomplete={auth.mode === 'signup' ? 'new-password' : 'current-password'}
				disabled={busy}
			/>
			{#if ui.turnstileSiteKey}
				<Turnstile bind:this={turnstile} siteKey={ui.turnstileSiteKey} action={auth.mode} bind:token={turnstileToken} bind:failed={turnstileFailed} />
			{/if}
			{#if error}<div class="nt-error">{error}</div>{/if}
			{#if unverifiedEmail}
				<button class="link" type="button" onclick={() => resend(unverifiedEmail!)} disabled={resending}>
					{resending ? 'Sending…' : 'Resend confirmation email'}
				</button>
			{/if}
			<button class="nt-btn nt-btn-primary" type="submit" disabled={!canSubmit}>
				{#if busy}
					{auth.mode === 'signup' ? 'Creating account…' : 'Signing in…'}
				{:else if needsToken && !turnstileToken && !turnstileFailed}
					Verifying…
				{:else}
					{auth.mode === 'signup' ? 'Create account' : 'Sign in'}
				{/if}
			</button>
		</form>
		<div class="links nt-small">
			{#if signupAvailable}
				{#if auth.mode === 'login'}
					<button class="link" type="button" onclick={() => switchMode('signup')}>No account yet? Create one</button>
				{:else}
					<button class="link" type="button" onclick={() => switchMode('login')}>Already have an account? Sign in</button>
				{/if}
			{/if}
			<button class="link" type="button" onclick={() => c.approveFromDashboard()}>Signed in to the Notette dashboard? Approve there</button>
		</div>
	{:else if auth.status === 'verify'}
		<p class="nt-muted">
			We sent a confirmation link to <strong>{ui.verifyEmail}</strong>. Open it to activate your account, then sign in
			here with your password.
		</p>
		<div class="actions">
			<button class="nt-btn nt-btn-primary" type="button" onclick={backToSignIn}>I confirmed it, sign in</button>
			<button class="nt-btn nt-btn-ghost" type="button" onclick={() => resend(ui.verifyEmail)} disabled={resending}>
				{resending ? 'Sending…' : 'Resend email'}
			</button>
		</div>
	{:else if auth.status === 'waiting'}
		<p class="nt-muted">Approve the request in the Notette window that just opened. This page will update automatically.</p>
		<div class="actions">
			<a class="nt-btn" href={auth.url} target="notette-authorize" rel="noopener">Reopen window</a>
			<button class="nt-btn nt-btn-ghost" type="button" onclick={() => c.openSignIn()}>Cancel</button>
		</div>
	{:else if auth.status === 'blocked'}
		<p class="nt-muted">Your browser blocked the popup. Open the sign-in page in a new tab, approve the request, then come back here.</p>
		<div class="actions">
			<a class="nt-btn nt-btn-primary" href={auth.url} target="_blank" rel="noopener">Open sign-in page</a>
			<button class="nt-btn nt-btn-ghost" type="button" onclick={() => c.openSignIn()}>Cancel</button>
		</div>
	{:else if auth.status === 'denied'}
		<p class="nt-muted">The request was denied.</p>
		<div class="actions">
			<button class="nt-btn" type="button" onclick={() => c.openSignIn()}>Back</button>
			<button class="nt-btn nt-btn-ghost" type="button" onclick={() => c.cancelSignIn()}>Close</button>
		</div>
	{:else if auth.status === 'expired'}
		<p class="nt-muted">The sign-in request expired. Try again.</p>
		<div class="actions">
			<button class="nt-btn nt-btn-primary" type="button" onclick={() => c.approveFromDashboard()}>Try again</button>
			<button class="nt-btn nt-btn-ghost" type="button" onclick={() => c.openSignIn()}>Back</button>
		</div>
	{:else}
		<div class="nt-error">{auth.message || 'Sign-in failed.'}</div>
		<div class="actions">
			<button class="nt-btn" type="button" onclick={() => c.openSignIn()}>Back</button>
			<button class="nt-btn nt-btn-ghost" type="button" onclick={() => c.cancelSignIn()}>Close</button>
		</div>
	{/if}
</div>

<style>
	.dialog {
		position: fixed;
		right: 20px;
		bottom: 84px;
		z-index: 45;
		width: min(340px, calc(100vw - 24px));
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 12px;
		animation: nt-fade-in 0.15s ease;
	}
	:global(.nt-root[data-position='bottom-left']) .dialog {
		right: auto;
		left: 20px;
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.form {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.actions {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}
	.links {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 4px;
	}
	.link {
		padding: 0;
		border: none;
		background: none;
		color: var(--nt-accent);
		font-size: 12px;
		text-align: left;
	}
	.link:hover {
		text-decoration: underline;
	}
	.link:disabled {
		opacity: 0.6;
		cursor: default;
	}
</style>
