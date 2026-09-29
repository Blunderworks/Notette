<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { confirmSubmit } from '$lib/confirm.svelte';
	import CopyButton from '$lib/components/CopyButton.svelte';
	import {
		basicEmbedSnippet,
		deploymentEmbedSnippet,
		identityEmbedSnippet,
		identityTokenSnippet,
		programmaticEmbedSnippet
	} from '$lib/embed';
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

	const identity = $derived(data.identity);
	type IdentityValues = { mode: string; publicKey: string; jwksUrl: string; issuer: string; audience: string };
	const identityValues: IdentityValues = $derived(
		form?.action === 'identity' && 'identityValues' in form && form.identityValues
			? (form.identityValues as IdentityValues)
			: { mode: identity.mode, publicKey: identity.publicKey, jwksUrl: identity.jwksUrl, issuer: identity.issuer, audience: identity.audience }
	);
	let identityModeChoice = $state<string | null>(null);
	const identityMode = $derived(identityModeChoice ?? identityValues.mode);
	/** Shown once, right after the action that generated it. */
	const newIdentitySecret = $derived(form && 'secret' in form && typeof form.secret === 'string' ? form.secret : null);
	const identityAlgorithm = $derived(identity.mode === 'secret' ? 'HS256' : (identity.publicKeyAlgorithm ?? 'RS256'));
	const identityServerSnippet = $derived(identityTokenSnippet(project.clientKey, identityAlgorithm));
	const identityWidgetSnippet = $derived(identityEmbedSnippet(data.baseUrl, project.clientKey, identity.mode === 'jwks'));
	const identityModes = [
		{ value: 'off', label: 'Off', help: 'Identity tokens are rejected. Feedback is anonymous or from Notette accounts.' },
		{
			value: 'secret',
			label: 'Shared secret (HS256)',
			help: 'Notette generates a secret that your server uses to sign tokens. The simplest option.'
		},
		{
			value: 'public_key',
			label: 'Public key',
			help: 'Your server signs with its own private key (RS256, ES256 or EdDSA); Notette only stores the public key.'
		},
		{
			value: 'jwks',
			label: 'Identity provider (JWKS)',
			help: 'Accept ID tokens from Auth0, Cognito, Firebase, Supabase or another OpenID Connect provider without backend changes.'
		}
	];

	// The default enhance resets the form after success, which blanks inputs whose saved values did not change.
	const keepValues: SubmitFunction = () => async ({ update }) => update({ reset: false });
	const keepTurnstileValues: SubmitFunction = ({ formElement }) => async ({ result, update }) => {
		await update({ reset: false });
		if (result.type === 'success') {
			(formElement.elements.namedItem('secretKey') as HTMLInputElement).value = '';
			(formElement.elements.namedItem('remove') as HTMLInputElement).checked = false;
		}
	};
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
						<option value={candidate.id}>{candidate.name} ({candidate.email}){candidate.verified ? '' : ' · email not confirmed'}</option>
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

	<form method="POST" action="?/update" class="card" use:enhance={keepValues}>
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
						use. When off, only members added above (plus owners and admins) can sign in on this project.
					</span>
				</span>
			</label>
			<label class="checkbox">
				<input type="checkbox" name="emailVerificationRequired" checked={values.emailVerificationRequired} disabled={!data.verificationConfigured} />
				<span>
					<strong>Require email verification for signups</strong>
					<span class="help" style="display: block">
						{#if data.verificationConfigured}
							Accounts created from the widget must confirm their email address through a link before they can sign in.
						{:else}
							Needs outgoing email and a public URL: set <code class="inline">SMTP_HOST</code>,
							<code class="inline">EMAIL_FROM</code> and <code class="inline">NOTETTE_URL</code> on the server to enable this.
						{/if}
					</span>
				</span>
			</label>
			{#if !data.verificationConfigured && values.emailVerificationRequired}
				<input type="hidden" name="emailVerificationRequired" value="on" />
			{/if}
		</div>
		<div class="card-footer form-actions">
			<button class="btn btn-primary" type="submit">Save settings</button>
		</div>
	</form>

	<form method="POST" action="?/notifications" class="card" use:enhance={keepValues}>
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

	<div class="card">
		<div class="card-header"><h2>Bot protection</h2></div>
		<form method="POST" action="?/turnstile" class="card-body stack" use:enhance={keepTurnstileValues}>
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

	<div class="card">
		<div class="card-header"><h2>Identity verification</h2></div>
		<div class="card-body stack">
			<p class="help">
				Let your app vouch for its signed-in users. Your server signs a short-lived token (JWT) with the user's ID and,
				optionally, name and email. The widget sends it with each request, and feedback is attributed to that user and
				marked <em>verified</em>. Verified users count as signed in when anonymous feedback is off and skip bot
				protection. They do not become Notette accounts.
			</p>
			{#if (form?.action === 'identity' || form?.action === 'identitySecret') && form.errors?.length}
				<div class="form-error">{#each form.errors as error}<div>{error}</div>{/each}</div>
			{:else if newIdentitySecret}
				<div class="form-success stack-sm">
					<strong>Copy the new secret now. It is not shown again.</strong>
					<div class="row"><code class="inline break">{newIdentitySecret}</code> <CopyButton text={newIdentitySecret} /></div>
					<span>
						Store it on your server, for example as <code class="inline">NOTETTE_IDENTITY_SECRET</code>. Never put it in
						browser or app code.
					</span>
				</div>
			{:else if form?.action === 'identitySecret' && form.success}
				<div class="form-success">Previous secret revoked. Tokens signed with it are no longer accepted.</div>
			{:else if form?.action === 'identity' && form.success}
				<div class="form-success">Identity verification saved.</div>
			{/if}
			<form method="POST" action="?/identity" class="stack" use:enhance={keepValues}>
				<fieldset class="stack-sm">
					<legend class="label">Verify tokens with</legend>
					{#each identityModes as option (option.value)}
						<label class="checkbox">
							<input
								type="radio"
								name="mode"
								value={option.value}
								checked={identityMode === option.value}
								onchange={() => (identityModeChoice = option.value)}
							/>
							<span><strong>{option.label}</strong><span class="help" style="display: block">{option.help}</span></span>
						</label>
					{/each}
				</fieldset>
				{#if identityMode === 'secret'}
					<p class="help">
						{identity.mode === 'secret' && identity.secretSet
							? 'A secret is saved. Rotate it below if it may have leaked.'
							: 'Saving generates a secret and shows it once.'}
					</p>
				{:else if identityMode === 'public_key'}
					<div class="field">
						<label class="label" for="identityPublicKey">Public key (PEM)</label>
						<textarea class="textarea mono" id="identityPublicKey" name="publicKey" rows="6" placeholder="-----BEGIN PUBLIC KEY-----">{identityValues.publicKey}</textarea>
						<span class="help">
							RSA (2048 bits or more), EC P-256/P-384/P-521 or Ed25519. Keep the private key on your server.
							{#if identity.mode === 'public_key' && identity.publicKeyAlgorithm}Tokens must be signed with
								{identity.publicKeyAlgorithm}{identity.publicKeyAlgorithm.startsWith('RS') ? ' or another RSA algorithm' : ''}.{/if}
						</span>
					</div>
				{:else if identityMode === 'jwks'}
					<div class="field">
						<label class="label" for="identityJwksUrl">JWKS URL</label>
						<input class="input mono" id="identityJwksUrl" name="jwksUrl" value={identityValues.jwksUrl} placeholder="https://your-tenant.example.com/.well-known/jwks.json" autocomplete="off" />
					</div>
					<div class="field">
						<label class="label" for="identityIssuer">Issuer (<code class="inline">iss</code>)</label>
						<input class="input mono" id="identityIssuer" name="issuer" value={identityValues.issuer} maxlength="500" placeholder="https://your-tenant.example.com/" autocomplete="off" />
					</div>
					<div class="field">
						<label class="label" for="identityAudience">Audience (<code class="inline">aud</code>)</label>
						<input class="input mono" id="identityAudience" name="audience" value={identityValues.audience} maxlength="500" placeholder="Your app's client ID" autocomplete="off" />
						<span class="help">
							Both must match the token exactly. ID tokens usually carry your app's client ID as the audience. If your
							provider's tokens have no <code class="inline">aud</code> claim, add one with a custom token template.
						</span>
					</div>
				{/if}
				<button class="btn btn-primary" type="submit" style="align-self: flex-start">Save identity verification</button>
			</form>
			{#if identity.mode === 'secret' && identity.secretSet}
				<div class="row">
					<form method="POST" action="?/rotateIdentitySecret" use:enhance={confirmSubmit({ title: 'Rotate the identity secret?', message: 'A new secret is generated. The current one keeps working until you revoke it, so you can deploy the new one first.', confirmLabel: 'Rotate secret', danger: false })}>
						<button class="btn" type="submit">Rotate secret</button>
					</form>
					{#if identity.previousSecretSet}
						<form method="POST" action="?/revokePreviousIdentitySecret" use:enhance={confirmSubmit({ title: 'Revoke the previous secret?', message: 'Tokens signed with it stop working immediately.', confirmLabel: 'Revoke' })}>
							<button class="btn" type="submit">Revoke previous secret</button>
						</form>
						<span class="help">The previous secret is still accepted.</span>
					{/if}
				</div>
			{/if}
			{#if identity.mode !== 'off'}
				<div class="stack-sm">
					{#if identity.mode !== 'jwks'}
						<h3>Sign tokens on your server</h3>
						<p class="muted small">
							Required claims: <code class="inline">sub</code> (your user ID) and <code class="inline">exp</code>.
							Optional: <code class="inline">name</code>, <code class="inline">email</code> and
							<code class="inline">aud</code>, which must be this project's client key when present. Keep tokens
							short-lived and only issue them to the signed-in user.
						</p>
						<div class="snippet">
							<pre>{identityServerSnippet}</pre>
							<div class="copy"><CopyButton text={identityServerSnippet} /></div>
						</div>
					{/if}
					<h3>Pass tokens to the widget</h3>
					<p class="muted small">
						The widget calls <code class="inline">userToken</code> whenever it needs a fresh token. Call
						<code class="inline">Notette.identify(null)</code> when the user signs out. Custom forms can post to the API
						directly with the token as a bearer credential.
					</p>
					<div class="snippet">
						<pre>{identityWidgetSnippet}</pre>
						<div class="copy"><CopyButton text={identityWidgetSnippet} /></div>
					</div>
				</div>
			{/if}
		</div>
	</div>

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
