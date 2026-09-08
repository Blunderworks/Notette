<script lang="ts">
	import { base } from '$app/paths';
	import { page } from '$app/state';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';

	let { data, children } = $props();
	let menuOpen = $state(false);

	const path = $derived(page.url.pathname);
	const isActive = (href: string, exact = false) => (exact ? path === href : path === href || path.startsWith(href + '/'));

	$effect(() => {
		// Close the mobile menu after navigation.
		void path;
		menuOpen = false;
	});
</script>

<div class="shell">
	{#if menuOpen}
		<div class="sidebar-backdrop" role="presentation" onclick={() => (menuOpen = false)}></div>
	{/if}
	<aside class="sidebar" class:open={menuOpen}>
		<a class="brand" href="/">
			<img class="brand-mark" src="{base}/favicon.svg" alt="" width="28" height="28" />
			Notette
		</a>
		<a class="nav-link" class:active={isActive('/', true)} href="/">Overview</a>
		{#if data.isAdmin}
			<a class="nav-link" class:active={isActive('/feedback')} href="/feedback">All feedback</a>

			<div class="nav-section">Projects</div>
			{#each data.navProjects as project (project.id)}
				<a class="nav-link" class:active={isActive(`/projects/${project.id}`)} href="/projects/{project.id}">
					<span class="truncate">{project.name}</span>
					{#if project.openCount > 0}<span class="count">{project.openCount}</span>{/if}
				</a>
			{/each}
			<a class="nav-link" class:active={isActive('/projects/new')} href="/projects/new">+ New project</a>
		{/if}

		<div class="nav-section">Settings</div>
		<a class="nav-link" class:active={isActive('/settings/account')} href="/settings/account">Account</a>
		{#if data.isAdmin}
			<a class="nav-link" class:active={isActive('/settings/users')} href="/settings/users">Users</a>
		{/if}

		<div class="sidebar-footer stack-sm">
			<div class="truncate" title={data.user?.email}>{data.user?.name}</div>
			<form method="POST" action="/logout">
				<button class="btn btn-sm btn-ghost" type="submit">Sign out</button>
			</form>
		</div>
	</aside>

	<div>
		<div class="topbar">
			<a class="brand" href="/" style="padding: 0">
				<img class="brand-mark" src="{base}/favicon.svg" alt="" width="28" height="28" />
				Notette
			</a>
			<button class="btn btn-sm" type="button" onclick={() => (menuOpen = !menuOpen)} aria-expanded={menuOpen}>
				Menu
			</button>
		</div>
		<main class="main">
			{@render children()}
		</main>
	</div>
</div>
<ConfirmDialog />
