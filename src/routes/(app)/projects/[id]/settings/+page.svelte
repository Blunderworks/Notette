<script lang="ts">
	import { enhance } from '$app/forms';
	import CopyButton from '$lib/components/CopyButton.svelte';
	import { basicEmbedSnippet, deploymentEmbedSnippet, programmaticEmbedSnippet } from '$lib/embed';

	let { data, form } = $props();
	const project = $derived(data.project);
	const values = $derived(
		form?.action === 'update' && form.values
			? form.values
			: {
					name: project.name,
					originsText: project.allowedOrigins.join('\n'),
					publicFeedbackVisible: project.publicFeedbackVisible,
					reviewerRepliesEnabled: project.reviewerRepliesEnabled,
					screenshotsEnabled: project.screenshotsEnabled
				}
	);
	const basic = $derived(basicEmbedSnippet(data.baseUrl, project.clientKey));
	const withDeployment = $derived(deploymentEmbedSnippet(data.baseUrl, project.clientKey));
	const programmatic = $derived(programmaticEmbedSnippet(data.baseUrl, project.clientKey));
	let showAdvanced = $state(false);
</script>

<svelte:head>
	<title>Settings · {project.name} · Notette</title>
</svelte:head>

<div class="stack">
	{#if data.created}
		<div class="form-success">Project created. Add the embed snippet below to your site to start collecting feedback.</div>
	{/if}

	<div class="card">
		<div class="card-header">
			<h2>Embed the widget</h2>
		</div>
		<div class="card-body stack">
			<p class="muted">
				Add this tag to every page where you want feedback (typically your root layout). The client key is a public
				identifier, not a secret. Requests are only accepted from the allowed origins below.
			</p>
			<div class="snippet">
				<pre>{basic}</pre>
				<div class="copy"><CopyButton text={basic} /></div>
			</div>
			<div class="kv">
				<dt>Client key</dt>
				<dd class="row"><code class="inline">{project.clientKey}</code> <CopyButton text={project.clientKey} class="btn btn-sm btn-ghost" /></dd>
				<dt>Widget script</dt>
				<dd><code class="inline">{data.baseUrl}/notette.js</code></dd>
			</div>
			<button class="btn btn-ghost btn-sm" type="button" onclick={() => (showAdvanced = !showAdvanced)} style="align-self: flex-start">
				{showAdvanced ? 'Hide' : 'Show'} deployment metadata &amp; programmatic setup
			</button>
			{#if showAdvanced}
				<div class="stack">
					<div class="stack-sm">
						<h3>Tag deployments</h3>
						<p class="muted small">
							Pass build information through <code class="inline">data-*</code> attributes so each item is tied to a
							specific deployment. Fill the values from your CI or hosting platform's environment variables.
						</p>
						<div class="snippet">
							<pre>{withDeployment}</pre>
							<div class="copy"><CopyButton text={withDeployment} /></div>
						</div>
					</div>
					<div class="stack-sm">
						<h3>Programmatic initialization</h3>
						<p class="muted small">
							Use <code class="inline">data-auto-init="false"</code> and call <code class="inline">Notette.init()</code> to
							pass deployment metadata, a known reviewer identity or custom metadata from JavaScript.
						</p>
						<div class="snippet">
							<pre>{programmatic}</pre>
							<div class="copy"><CopyButton text={programmatic} /></div>
						</div>
					</div>
				</div>
			{/if}
		</div>
	</div>

	<form method="POST" action="?/update" class="card" use:enhance>
		<div class="card-header">
			<h2>Project settings</h2>
		</div>
		<div class="card-body stack">
			{#if form?.action === 'update' && form.errors?.length}
				<div class="form-error">{#each form.errors as error}<div>{error}</div>{/each}</div>
			{:else if form?.action === 'update' && form.success}
				<div class="form-success">Settings saved.</div>
			{/if}
			<div class="field">
				<label class="label" for="name">Project name</label>
				<input class="input" id="name" name="name" required maxlength="100" value={values.name} />
			</div>
			<div class="field">
				<label class="label" for="allowedOrigins">Allowed origins</label>
				<textarea class="textarea mono" id="allowedOrigins" name="allowedOrigins" placeholder={'https://app.example.com\nhttps://*.vercel.app\nhttp://localhost:3000'}>{values.originsText}</textarea>
				<span class="help">
					One origin per line. Wildcards such as <code class="inline">https://*.vercel.app</code> or
					<code class="inline">http://localhost:*</code> are supported. A lone <code class="inline">*</code> allows any origin.
				</span>
			</div>
			<label class="checkbox">
				<input type="checkbox" name="publicFeedbackVisible" checked={values.publicFeedbackVisible} />
				<span>
					<strong>Reviewers can see existing feedback</strong>
					<span class="help" style="display: block">Show pins, threads and screenshots to anyone on the site, not only signed-in admins.</span>
				</span>
			</label>
			<label class="checkbox">
				<input type="checkbox" name="reviewerRepliesEnabled" checked={values.reviewerRepliesEnabled} />
				<span><strong>Reviewers can reply to threads</strong></span>
			</label>
			<label class="checkbox">
				<input type="checkbox" name="screenshotsEnabled" checked={values.screenshotsEnabled} />
				<span>
					<strong>Capture screenshots</strong>
					<span class="help" style="display: block">Attach a viewport screenshot to each feedback item. Submission still succeeds if capture fails.</span>
				</span>
			</label>
		</div>
		<div class="card-footer form-actions">
			<button class="btn btn-primary" type="submit">Save settings</button>
		</div>
	</form>

	<div class="card danger">
		<div class="card-header">
			<h2>Danger zone</h2>
		</div>
		<div class="card-body stack">
			{#if (form?.action === 'delete' || form?.action === 'regenerateKey') && form.errors?.length}
				<div class="form-error">{#each form.errors as error}<div>{error}</div>{/each}</div>
			{:else if form?.action === 'regenerateKey' && form.success}
				<div class="form-success">Client key regenerated. Update the embed snippet on your site.</div>
			{/if}
			<form method="POST" action="?/regenerateKey" class="row" use:enhance>
				<div style="flex: 1; min-width: 240px">
					<strong>Regenerate client key</strong>
					<p class="help">Existing embeds stop working until they are updated with the new key.</p>
				</div>
				<button class="btn" type="submit" onclick={(e) => { if (!confirm('Regenerate the client key? Existing embeds will stop working.')) e.preventDefault(); }}>Regenerate key</button>
			</form>
			<form method="POST" action="?/delete" class="row" use:enhance>
				<div style="flex: 1; min-width: 240px">
					<strong>Delete project</strong>
					<p class="help">Permanently deletes all feedback, comments and screenshots. Type <code class="inline">{project.name}</code> to confirm.</p>
				</div>
				<input class="input" name="confirm" placeholder={project.name} style="width: 220px" autocomplete="off" />
				<button class="btn btn-danger" type="submit">Delete project</button>
			</form>
		</div>
	</div>
</div>
