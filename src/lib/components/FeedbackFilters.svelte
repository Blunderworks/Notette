<script lang="ts">
	interface ProjectOption {
		id: string;
		name: string;
	}

	interface Props {
		status: string;
		q: string;
		projects?: ProjectOption[];
		projectId?: string;
		total: number;
	}

	let { status, q, projects, projectId = '', total }: Props = $props();
</script>

<form method="GET" class="filters" data-sveltekit-keepfocus>
	{#if projects}
		<select class="select" name="project" aria-label="Project">
			<option value="" selected={projectId === ''}>All projects</option>
			{#each projects as p (p.id)}
				<option value={p.id} selected={projectId === p.id}>{p.name}</option>
			{/each}
		</select>
	{/if}
	<select
		class="select"
		name="status"
		aria-label="Status"
		onchange={(e) => e.currentTarget.form?.requestSubmit()}
	>
		<option value="open" selected={status === 'open'}>Open</option>
		<option value="resolved" selected={status === 'resolved'}>Resolved</option>
		<option value="all" selected={status === 'all'}>All</option>
	</select>
	<input class="input search" type="search" name="q" placeholder="Search text, path, author or #number" value={q} />
	<button class="btn" type="submit">Search</button>
	<span class="small faint">{total} {total === 1 ? 'item' : 'items'}</span>
</form>
