<script lang="ts">
	import { enhance } from '$app/forms';
	import { confirmSubmit } from '$lib/confirm.svelte';
	import CopyButton from '$lib/components/CopyButton.svelte';
	import { basicEmbedSnippet, deploymentEmbedSnippet, programmaticEmbedSnippet } from '$lib/embed';
	import { timeAgo } from '$lib/format';

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
					screenshotsEnabled: project.screenshotsEnabled,
					anonymousFeedbackAllowed: project.anonymousFeedbackAllowed,
					openSignups: project.openSignups,
					emailVerificationRequired: project.emailVerificationRequired
				}
	);
	const memberValues = $derived(
		form?.action === 'createMember' && 'memberValues' in form && form.memberValues
			? form.memberValues
			: { name: '', email: '' }
	);
	const memberAction = $derived(
		form?.action === 'addMember' || form?.action === 'createMember' || form?.action === 'removeMember' ? form : null
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
	<div class="card">
		<div class="card-header"><h2>Bot protection</h2></div>
		<form method="POST" action="?/turnstile" class="card-body stack" use:enhance>
			<p class="help">Turnstile is {data.turnstileConfigured ? 'enabled' : 'disabled'} for this project. Protects anonymous feedback and replies, and widget sign-in and sign-up.</p>
			{#if form?.action === 'turnstile'}
				{#if form.errors}<div class="form-error">{form.errors.join(' ')}</div>{/if}
				{#if form.success}<div class="form-success">Bot protection settings saved.</div>{/if}
			{/if}
			<div class="field">
				<label class="label" for="siteKey">Turnstile site key</label>
				<input class="input" id="siteKey" name="siteKey" value={project.turnstileSiteKey ?? ''} maxlength="256" autocomplete="off" />
			</div>
			<div class="field">
				<label class="label" for="secretKey">Turnstile secret key</label>
				<input class="input" id="secretKey" name="secretKey" type="password" maxlength="256" autocomplete="new-password" />
				<p class="help">{data.turnstileConfigured ? 'A secret is saved. Leave blank to keep it, or enter a replacement.' : 'Enter the secret key from Cloudflare.'}</p>
			</div>
			<p class="help">Add each embedding site's hostname in Cloudflare → Turnstile → Hostnames, including localhost when testing. Host sites must allow https://challenges.cloudflare.com in their CSP script-src and frame-src.</p>
			<label class="row"><input type="checkbox" name="remove" /> Disable Turnstile and remove both keys</label>
			<button class="btn btn-primary" type="submit">Save bot protection</button>
		</form>
	</div>
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
					{#if data.turnstileConfigured}
						Bot protection is on: every hostname listed here must also be added to your Turnstile widget's hostnames in
						the Cloudflare dashboard, or the challenge fails with error 110200.
					{/if}
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
			<label class="checkbox">
				<input type="checkbox" name="anonymousFeedbackAllowed" checked={values.anonymousFeedbackAllowed} />
				<span>
					<strong>Allow anonymous feedback</strong>
					<span class="help" style="display: block">
						Anyone on the site can use the widget without an account. When off, visitors must sign in (or sign up,
						if enabled below) before the widget opens.
					</span>
				</span>
			</label>
			<label class="checkbox">
				<input type="checkbox" name="openSignups" checked={values.openSignups} />
				<span>
					<strong>Open for signups</strong>
					<span class="help" style="display: block">
						Visitors can create an account from the widget, and any signed-in account joins this project on first
						use. When off, only members added below (plus owners and admins) can sign in on this project.
					</span>
				</span>
			</label>
			<label class="checkbox">
				<input type="checkbox" name="emailVerificationRequired" checked={values.emailVerificationRequired} disabled={!data.emailConfigured} />
				<span>
					<strong>Require email verification for signups</strong>
					<span class="help" style="display: block">
						{#if data.emailConfigured}
							Accounts created from the widget must confirm their email address through a link before they can sign in.
						{:else}
							Needs outgoing email: set <code class="inline">SMTP_HOST</code> and <code class="inline">EMAIL_FROM</code> on the server to enable this.
						{/if}
					</span>
				</span>
			</label>
			{#if !data.emailConfigured && values.emailVerificationRequired}
				<input type="hidden" name="emailVerificationRequired" value="on" />
			{/if}
		</div>
		<div class="card-footer form-actions">
			<button class="btn btn-primary" type="submit">Save settings</button>
		</div>
	</form>

	<div class="card">
		<div class="card-header">
			<h2>Members</h2>
		</div>
		<div class="card-body stack">
			<p class="muted small">
				Members are accounts with the <em>member</em> role that can sign in to the widget on this project. Owners and
				admins always have access.
				{#if project.openSignups}
					This project is open for signups, so accounts also join automatically when they sign in or sign up from the
					widget.
				{/if}
			</p>
			{#if memberAction?.errors?.length}
				<div class="form-error">{#each memberAction.errors as error}<div>{error}</div>{/each}</div>
			{:else if memberAction?.success}
				<div class="form-success">
					{#if memberAction.action === 'removeMember'}Member removed.{:else}Member added.{/if}
				</div>
			{/if}
			{#if data.members.length === 0}
				<p class="muted small">No members yet.</p>
			{:else}
				<div class="table-wrap">
					<table class="table">
						<thead>
							<tr><th>Name</th><th>Email</th><th>Added</th><th></th></tr>
						</thead>
						<tbody>
							{#each data.members as member (member.userId)}
								<tr>
									<td>{member.name}{#if member.role !== 'member'}<span class="faint"> ({member.role})</span>{/if}</td>
									<td class="muted">{member.email}</td>
									<td class="small muted">{timeAgo(member.addedAt)}</td>
									<td>
										<form method="POST" action="?/removeMember" use:enhance>
											<input type="hidden" name="userId" value={member.userId} />
											<button class="btn btn-sm btn-ghost" type="submit">Remove</button>
										</form>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
			<form method="POST" action="?/addMember" class="row" use:enhance>
				<select class="select" name="userId" required style="flex: 1; min-width: 240px" aria-label="Existing member account">
					<option value="">{data.candidates.length ? 'Add an existing member account…' : 'No other member accounts to add'}</option>
					{#each data.candidates as candidate (candidate.id)}
						<option value={candidate.id}>{candidate.name} ({candidate.email})</option>
					{/each}
				</select>
				<button class="btn" type="submit" disabled={data.candidates.length === 0}>Add</button>
			</form>
			<form method="POST" action="?/createMember" class="stack-sm" use:enhance>
				<strong>Create a member account</strong>
				<div class="row">
					<input class="input" name="name" placeholder="Name" required maxlength="120" value={memberValues.name} style="flex: 1; min-width: 140px" />
					<input class="input" name="email" type="email" placeholder="Email" required value={memberValues.email} style="flex: 1; min-width: 180px" />
					<input class="input" name="password" type="password" placeholder="Initial password" minlength="10" required autocomplete="new-password" style="flex: 1; min-width: 160px" />
					<button class="btn" type="submit">Create &amp; add</button>
				</div>
				<span class="help">
					The account gets the member role and is added to this project. Share the password securely; they can change it
					under Account after signing in at <code class="inline">{data.baseUrl}</code>.
				</span>
			</form>
		</div>
	</div>

	<form method="POST" action="?/notifications" class="card" use:enhance>
		<div class="card-header">
			<h2>Your notifications</h2>
		</div>
		<div class="card-body stack">
			{#if form?.action === 'notifications' && form.success}
				<div class="form-success">Notification settings saved.</div>
			{/if}
			{#if data.emailConfigured}
				<label class="checkbox">
					<input type="checkbox" name="emailNotifications" checked={data.emailNotifications} />
					<span>
						<strong>Email me about activity in this project</strong>
						<span class="help" style="display: block">
							New feedback, replies in threads you take part in and @-mentions, grouped into one email about a minute
							after the first update. This setting is personal to your account.
						</span>
					</span>
				</label>
			{:else}
				<p class="muted small">
					Email notifications are unavailable because outgoing email is not configured on this server. Set
					<code class="inline">SMTP_HOST</code> and <code class="inline">EMAIL_FROM</code> to enable them.
				</p>
			{/if}
		</div>
		{#if data.emailConfigured}
			<div class="card-footer form-actions">
				<button class="btn btn-primary" type="submit">Save</button>
			</div>
		{/if}
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
			<form method="POST" action="?/regenerateKey" class="row" use:enhance={confirmSubmit({ title: 'Regenerate the client key?', message: 'Existing embeds stop working until they are updated with the new key.', confirmLabel: 'Regenerate key' })}>
				<div style="flex: 1; min-width: 240px">
					<strong>Regenerate client key</strong>
					<p class="help">Existing embeds stop working until they are updated with the new key.</p>
				</div>
				<button class="btn" type="submit">Regenerate key</button>
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
