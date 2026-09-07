<script lang="ts">
	import FeedbackList from '$lib/components/FeedbackList.svelte';
	import { timeAgo } from '$lib/format';

	let { data } = $props();
</script>

<svelte:head>
	<title>Overview · Notette</title>
</svelte:head>

{#if data.member}
	<div class="container narrow stack">
		<div class="page-header">
			<div>
				<h1>Your projects</h1>
				<p class="subtitle">
					Feedback is left through the widget on each site. Sign in there with the same email and password you use
					here.
				</p>
			</div>
		</div>

		{#if data.memberProjects.length === 0}
			<div class="card">
				<div class="card-body stack">
					<h2>No projects yet</h2>
					<p class="muted">
						You have not been added to any project. Ask an admin to add you, or sign up from the widget on a site
						that is open for signups.
					</p>
				</div>
			</div>
		{:else}
			<div class="grid">
				{#each data.memberProjects as project (project.id)}
					<div class="card">
						<div class="card-body stack-sm">
							<h2>{project.name}</h2>
							{#if project.sites.length > 0}
								{#each project.sites as site (site)}
									<a class="mono small" href={site} target="_blank" rel="noopener">{site}</a>
								{/each}
							{:else}
								<p class="small faint">No site URL configured yet.</p>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
{:else}
	<div class="container stack">
		<div class="page-header">
			<div>
				<h1>Overview</h1>
				<p class="subtitle">{data.openTotal} open {data.openTotal === 1 ? 'item' : 'items'} across {data.projects.length} {data.projects.length === 1 ? 'project' : 'projects'}.</p>
			</div>
			<div class="page-actions">
				<a class="btn btn-primary" href="/projects/new">New project</a>
			</div>
		</div>

		{#if data.projects.length === 0}
			<div class="card">
				<div class="card-body stack">
					<h2>Create your first project</h2>
					<p class="muted">
						A project groups feedback for one site or app. After creating it you will get an embed snippet to add
						the feedback widget to your deployment.
					</p>
					<div><a class="btn btn-primary" href="/projects/new">Create project</a></div>
				</div>
			</div>
		{:else}
			<div class="grid">
				{#each data.projects as project (project.id)}
					<a class="card" href="/projects/{project.id}" style="color: inherit; text-decoration: none">
						<div class="card-body stack-sm">
							<h2>{project.name}</h2>
							<div class="row" style="gap: 20px">
								<div class="stat">
									<span class="value">{project.openCount}</span>
									<span class="label">open</span>
								</div>
								<div class="stat">
									<span class="value">{project.resolvedCount}</span>
									<span class="label">resolved</span>
								</div>
							</div>
							<p class="small faint">
								{#if project.lastFeedbackAt}
									Last feedback {timeAgo(project.lastFeedbackAt)}
								{:else if project.allowedOrigins.length === 0}
									No allowed origins configured yet
								{:else}
									No feedback yet
								{/if}
							</p>
						</div>
					</a>
				{/each}
			</div>

			<div class="card">
				<div class="card-header">
					<h2>Recent open feedback</h2>
					<a class="btn btn-sm" href="/feedback">View all</a>
				</div>
				<FeedbackList items={data.recent} showProject emptyTitle="Nothing open" emptyText="All caught up." />
			</div>
		{/if}
	</div>
{/if}
