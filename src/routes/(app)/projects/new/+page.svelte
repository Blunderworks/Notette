<script lang="ts">
	import { enhance } from '$app/forms';

	let { form } = $props();
	const values = $derived(
		form?.values ?? {
			name: '',
			originsText: '',
			publicFeedbackVisible: true,
			reviewerRepliesEnabled: true,
			screenshotsEnabled: true,
			anonymousFeedbackAllowed: true,
			openSignups: false
		}
	);
</script>

<svelte:head>
	<title>New project · Notette</title>
</svelte:head>

<div class="container narrow stack">
	<div class="page-header">
		<div>
			<h1>New project</h1>
			<p class="subtitle">One project per site or app. You will get the embed snippet on the next screen.</p>
		</div>
	</div>

	<form method="POST" class="card" use:enhance>
		<div class="card-body stack">
			{#if form?.errors?.length}
				<div class="form-error">
					{#each form.errors as error}<div>{error}</div>{/each}
				</div>
			{/if}
			<div class="field">
				<label class="label" for="name">Project name</label>
				<input class="input" id="name" name="name" required maxlength="100" value={values.name} />
			</div>
			<div class="field">
				<label class="label" for="allowedOrigins">Allowed origins</label>
				<textarea class="textarea mono" id="allowedOrigins" name="allowedOrigins" placeholder={'https://app.example.com\nhttps://*.vercel.app\nhttp://localhost:3000'}>{values.originsText}</textarea>
				<span class="help">
					One origin per line. The widget only works on these origins and the API rejects requests from anywhere
					else. Use <code class="inline">*</code> as a wildcard for preview subdomains, e.g.
					<code class="inline">https://*.vercel.app</code>.
				</span>
			</div>
			<label class="checkbox">
				<input type="checkbox" name="publicFeedbackVisible" checked={values.publicFeedbackVisible} />
				<span>
					<strong>Reviewers can see existing feedback</strong>
					<span class="help" style="display: block">Show pins and threads to anyone on the site, not only signed-in admins.</span>
				</span>
			</label>
			<label class="checkbox">
				<input type="checkbox" name="reviewerRepliesEnabled" checked={values.reviewerRepliesEnabled} />
				<span>
					<strong>Reviewers can reply to threads</strong>
				</span>
			</label>
			<label class="checkbox">
				<input type="checkbox" name="screenshotsEnabled" checked={values.screenshotsEnabled} />
				<span>
					<strong>Capture screenshots</strong>
					<span class="help" style="display: block">Attach a viewport screenshot to each feedback item (captured in the browser).</span>
				</span>
			</label>
			<label class="checkbox">
				<input type="checkbox" name="anonymousFeedbackAllowed" checked={values.anonymousFeedbackAllowed} />
				<span>
					<strong>Allow anonymous feedback</strong>
					<span class="help" style="display: block">When off, visitors must sign in (or sign up, if enabled) before the widget opens.</span>
				</span>
			</label>
			<label class="checkbox">
				<input type="checkbox" name="openSignups" checked={values.openSignups} />
				<span>
					<strong>Open for signups</strong>
					<span class="help" style="display: block">
						Anyone can create an account from the widget and any signed-in account joins the project. When off, only
						members you add in the project settings can sign in.
					</span>
				</span>
			</label>
		</div>
		<div class="card-footer form-actions">
			<button class="btn btn-primary" type="submit">Create project</button>
			<a class="btn btn-ghost" href="/">Cancel</a>
		</div>
	</form>
</div>
