<script lang="ts">
	import { enhance } from '$app/forms';
	import { timeAgo } from '$lib/format';

	let { data, form } = $props();
</script>

<svelte:head>
	<title>Account · Notette</title>
</svelte:head>

<div class="container narrow stack">
	<div class="page-header">
		<div>
			<h1>Account</h1>
			<p class="subtitle">{data.user?.email} · {data.user?.role}</p>
		</div>
	</div>

	<form method="POST" action="?/profile" class="card" use:enhance>
		<div class="card-header"><h2>Profile</h2></div>
		<div class="card-body stack">
			{#if form?.action === 'profile' && form.error}<div class="form-error">{form.error}</div>{/if}
			{#if form?.action === 'profile' && form.success}<div class="form-success">Profile updated.</div>{/if}
			<div class="field">
				<label class="label" for="name">Display name</label>
				<input class="input" id="name" name="name" required maxlength="120" value={data.user?.name ?? ''} />
				<span class="help">Shown on comments you post from the dashboard or the widget.</span>
			</div>
		</div>
		<div class="card-footer form-actions"><button class="btn btn-primary" type="submit">Save</button></div>
	</form>

	<form method="POST" action="?/password" class="card" use:enhance>
		<div class="card-header"><h2>Change password</h2></div>
		<div class="card-body stack">
			{#if form?.action === 'password' && form.error}<div class="form-error">{form.error}</div>{/if}
			{#if form?.action === 'password' && form.success}<div class="form-success">Password changed. Other sessions were signed out.</div>{/if}
			<div class="field">
				<label class="label" for="current">Current password</label>
				<input class="input" id="current" name="current" type="password" autocomplete="current-password" required />
			</div>
			<div class="field">
				<label class="label" for="password">New password</label>
				<input class="input" id="password" name="password" type="password" autocomplete="new-password" minlength="10" required />
			</div>
			<div class="field">
				<label class="label" for="confirm">Confirm new password</label>
				<input class="input" id="confirm" name="confirm" type="password" autocomplete="new-password" required />
			</div>
		</div>
		<div class="card-footer form-actions"><button class="btn btn-primary" type="submit">Change password</button></div>
	</form>

	<div class="card">
		<div class="card-header">
			<h2>Sessions</h2>
			<form method="POST" action="?/revokeOthers" use:enhance>
				<button class="btn btn-sm" type="submit">Sign out other sessions</button>
			</form>
		</div>
		{#if form?.action === 'revokeSession' && form.error}<div class="card-body"><div class="form-error">{form.error}</div></div>{/if}
		<div class="table-wrap">
			<table class="table">
				<thead>
					<tr><th>Type</th><th>Where</th><th>Last used</th><th>Created</th><th></th></tr>
				</thead>
				<tbody>
					{#each data.sessions as session (session.id)}
						<tr>
							<td>
								{session.kind === 'widget' ? 'Widget' : 'Dashboard'}
								{#if session.current}<span class="badge neutral">current</span>{/if}
							</td>
							<td class="small muted">
								{#if session.origin}<div class="mono">{session.origin}</div>{/if}
								<div class="faint" style="max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap" title={session.userAgent ?? ''}>{session.userAgent ?? ''}</div>
							</td>
							<td class="small">{timeAgo(session.lastUsedAt)}</td>
							<td class="small">{timeAgo(session.createdAt)}</td>
							<td>
								{#if !session.current}
									<form method="POST" action="?/revokeSession" use:enhance>
										<input type="hidden" name="sessionId" value={session.id} />
										<button class="btn btn-sm btn-ghost" type="submit">Revoke</button>
									</form>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
</div>
