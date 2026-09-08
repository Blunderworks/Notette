<script lang="ts">
	import { enhance } from '$app/forms';
	import { timeAgo } from '$lib/format';

	let { data, form } = $props();
	const createValues = $derived.by((): { name: string; email: string } => {
		const values =
			form?.action === 'create' ? (form as { values?: { name?: string; email?: string } }).values : undefined;
		return { name: values?.name ?? '', email: values?.email ?? '' };
	});
</script>

<svelte:head>
	<title>Users · Notette</title>
</svelte:head>

<div class="container narrow stack">
	<div class="page-header">
		<div>
			<h1>Users</h1>
			<p class="subtitle">
				Owners and admins manage projects here and act as admins in the widget. Members can only sign in to the widget
				on projects they have been added to (see each project's settings).
			</p>
		</div>
	</div>

	{#if form?.error && form.action !== 'create'}
		<div class="form-error">{form.error}</div>
	{/if}

	<div class="card">
		<div class="table-wrap">
			<table class="table">
				<thead>
					<tr><th>Name</th><th>Email</th><th>Role</th><th>Added</th>{#if data.canManage}<th></th>{/if}</tr>
				</thead>
				<tbody>
					{#each data.users as user (user.id)}
						<tr>
							<td>{user.name}{#if user.isSelf}<span class="faint"> (you)</span>{/if}</td>
							<td class="muted">
								{user.email}
								{#if !user.verified}<span class="badge neutral" title="Has not confirmed their email address yet and cannot sign in">unverified</span>{/if}
							</td>
							<td>
								{#if data.canManage && !user.isSelf}
									<form method="POST" action="?/setRole" class="row" use:enhance>
										<input type="hidden" name="userId" value={user.id} />
										<select class="select" name="role" onchange={(e) => (e.currentTarget.form as HTMLFormElement).requestSubmit()}>
											<option value="member" selected={user.role === 'member'}>member</option>
											<option value="admin" selected={user.role === 'admin'}>admin</option>
											<option value="owner" selected={user.role === 'owner'}>owner</option>
										</select>
									</form>
								{:else}
									{user.role}
								{/if}
							</td>
							<td class="small muted">{timeAgo(user.createdAt)}</td>
							{#if data.canManage}
								<td>
									{#if !user.verified}
										<form method="POST" action="?/verify" use:enhance style="display: inline">
											<input type="hidden" name="userId" value={user.id} />
											<button class="btn btn-sm btn-ghost" type="submit" title="Activate the account without the confirmation email">Mark verified</button>
										</form>
									{/if}
									{#if !user.isSelf}
										<form method="POST" action="?/delete" use:enhance onsubmit={(e) => { if (!confirm(`Delete ${user.email}?`)) e.preventDefault(); }}>
											<input type="hidden" name="userId" value={user.id} />
											<button class="btn btn-sm btn-ghost" type="submit">Delete</button>
										</form>
									{/if}
								</td>
							{/if}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>

	{#if data.canManage}
		<form method="POST" action="?/create" class="card" use:enhance>
			<div class="card-header"><h2>Add user</h2></div>
			<div class="card-body stack">
				{#if form?.action === 'create' && form.error}<div class="form-error">{form.error}</div>{/if}
				{#if form?.action === 'create' && form.success}<div class="form-success">User created.</div>{/if}
				<div class="field">
					<label class="label" for="name">Name</label>
					<input class="input" id="name" name="name" required maxlength="120" value={createValues.name} />
				</div>
				<div class="field">
					<label class="label" for="email">Email</label>
					<input class="input" id="email" name="email" type="email" required value={createValues.email} />
				</div>
				<div class="field">
					<label class="label" for="password">Initial password</label>
					<input class="input" id="password" name="password" type="password" autocomplete="new-password" minlength="10" required />
					<span class="help">Share it with the user securely; they can change it under Account.</span>
				</div>
				<div class="field">
					<label class="label" for="role">Role</label>
					<select class="select" id="role" name="role">
						<option value="admin">admin — manage projects and feedback</option>
						<option value="owner">owner — additionally manage users</option>
						<option value="member">member — widget access on assigned projects only</option>
					</select>
				</div>
			</div>
			<div class="card-footer form-actions"><button class="btn btn-primary" type="submit">Add user</button></div>
		</form>
	{:else}
		<p class="muted small">Ask an owner to add or remove users.</p>
	{/if}
</div>
