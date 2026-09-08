<script lang="ts">
	import { enhance } from '$app/forms';
	import CopyButton from '$lib/components/CopyButton.svelte';
	import MentionText from '$lib/components/MentionText.svelte';
	import MentionTextarea from '$lib/components/MentionTextarea.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { formatDateTime, siteLinkForFeedback, timeAgo } from '$lib/format';
	import { formatFeedbackForAgent } from '$lib/shared/agent-format';
	import type { MentionRef } from '$lib/shared/types';

	let { data, form } = $props();
	const item = $derived(data.item);
	const project = $derived(data.project);
	const dashboardUrl = $derived(`${data.baseUrl}/projects/${project.id}/feedback/${item.id}`);
	const agentText = $derived(formatFeedbackForAgent(item, { projectName: project.name, dashboardUrl }));
	const attributeEntries = $derived(Object.entries(item.elementAttributes ?? {}));
	const deploymentEntries = $derived(Object.entries(item.deployment ?? {}).filter(([, v]) => v));
	let replyBody = $state('');
	let replyMentions = $state<MentionRef[]>([]);
</script>

<svelte:head>
	<title>#{item.number} · {project.name} · Notette</title>
</svelte:head>

<div class="stack">
	<div class="row small faint">
		<a href="/projects/{project.id}">{project.name}</a>
		<span>/</span>
		<span>#{item.number}</span>
	</div>

	<div class="page-header">
		<div class="stack-sm">
			<div class="row">
				<h1>#{item.number}</h1>
				<StatusBadge status={item.status} />
			</div>
			<p class="subtitle">
				{item.authorName ?? 'Anonymous'}{item.isAdmin ? ' (admin)' : item.isMember ? ' (member)' : ''}{item.authorEmail ? ` · ${item.authorEmail}` : ''}
				· <span title={item.createdAt}>{timeAgo(item.createdAt)}</span>
				{#if item.resolvedAt}· resolved {timeAgo(item.resolvedAt)}{/if}
			</p>
		</div>
		<div class="page-actions">
			<CopyButton text={agentText} label="Copy for Agent" copiedLabel="Copied for Agent" class="btn" />
			<a class="btn" href={siteLinkForFeedback(item.url, item.id)} target="_blank" rel="noopener">Open on site</a>
			<form method="POST" action="?/setStatus" use:enhance>
				<input type="hidden" name="status" value={item.status === 'open' ? 'resolved' : 'open'} />
				<button class="btn {item.status === 'open' ? 'btn-primary' : ''}" type="submit">
					{item.status === 'open' ? 'Resolve' : 'Reopen'}
				</button>
			</form>
			<form method="POST" action="?/delete" use:enhance={({ cancel }) => { if (!confirm('Delete this feedback and its replies?')) cancel(); }}>
				<button class="btn btn-danger" type="submit">Delete</button>
			</form>
		</div>
	</div>

	{#if form?.error}
		<div class="form-error">{form.error}</div>
	{/if}

	<div class="two-col">
		<div class="stack">
			<div class="thread">
				<div class="comment root">
					<div class="comment-head">
						<span class="author">{item.authorName ?? 'Anonymous'}</span>
						{#if item.isAdmin}<span class="badge admin">admin</span>{:else if item.isMember}<span class="badge member">member</span>{/if}
						<span title={item.createdAt}>{formatDateTime(item.createdAt)}</span>
					</div>
					<div class="comment-body"><MentionText text={item.body} mentions={item.mentions} /></div>
				</div>
				{#each data.comments as comment (comment.id)}
					<div class="comment">
						<div class="comment-head">
							<span class="author">{comment.authorName ?? 'Anonymous'}</span>
							{#if comment.isAdmin}<span class="badge admin">admin</span>{:else if comment.isMember}<span class="badge member">member</span>{/if}
							<span title={comment.createdAt}>{formatDateTime(comment.createdAt)}</span>
							<form method="POST" action="?/deleteComment" style="margin-left: auto" use:enhance={({ cancel }) => { if (!confirm('Delete this reply?')) cancel(); }}>
								<input type="hidden" name="commentId" value={comment.id} />
								<button class="btn btn-ghost btn-sm" type="submit">Delete</button>
							</form>
						</div>
						<div class="comment-body"><MentionText text={comment.body} mentions={comment.mentions} /></div>
					</div>
				{/each}
			</div>

			<form
				method="POST"
				action="?/reply"
				class="card"
				use:enhance={() =>
					async ({ result, update }) => {
						if (result.type === 'success') {
							replyBody = '';
							replyMentions = [];
						}
						await update();
					}}
			>
				<div class="card-body stack-sm">
					<label class="label" for="reply">Reply as {data.user?.name}</label>
					<MentionTextarea
						class="textarea"
						id="reply"
						name="body"
						required
						maxlength={5000}
						bind:value={replyBody}
						bind:mentions={replyMentions}
						candidates={data.mentionCandidates}
						placeholder={data.mentionCandidates.length ? 'Write a reply… type @ to mention someone' : 'Write a reply…'}
					/>
					<input type="hidden" name="mentions" value={replyMentions.map((m) => m.id).join(',')} />
					{#if data.mentionCandidates.length}
						<span class="help">Type @ to mention a project member or another admin; mentioned people are emailed when notifications are enabled.</span>
					{/if}
				</div>
				<div class="card-footer form-actions">
					<button class="btn btn-primary" type="submit">Post reply</button>
				</div>
			</form>

			{#if item.screenshotUrl}
				<div class="card">
					<div class="card-header">
						<h2>Screenshot</h2>
						<a class="btn btn-sm" href={item.screenshotUrl} target="_blank" rel="noopener">Open full size</a>
					</div>
					<div class="card-body">
						<a href={item.screenshotUrl} target="_blank" rel="noopener">
							<img class="screenshot" src={item.screenshotUrl} alt="Viewport screenshot captured with feedback #{item.number}" loading="lazy" />
						</a>
					</div>
				</div>
			{/if}
		</div>

		<div class="stack">
			<div class="card">
				<div class="card-header"><h2>Page</h2></div>
				<div class="card-body">
					<dl class="kv">
						<dt>URL</dt>
						<dd><a href={item.url} target="_blank" rel="noopener" class="break">{item.url}</a></dd>
						{#if item.pageTitle}<dt>Title</dt><dd>{item.pageTitle}</dd>{/if}
						{#if item.viewportWidth}
							<dt>Viewport</dt>
							<dd>{item.viewportWidth}×{item.viewportHeight}{item.devicePixelRatio ? ` @${item.devicePixelRatio}x` : ''}</dd>
						{/if}
						{#if item.scrollX !== null}
							<dt>Scroll</dt>
							<dd>({item.scrollX}, {item.scrollY})</dd>
						{/if}
						{#if item.clickX !== null}
							<dt>Click</dt>
							<dd>page ({item.clickX}, {item.clickY})</dd>
						{/if}
					</dl>
				</div>
			</div>

			{#if item.elementSelector || item.elementXpath || item.elementTag}
				<div class="card">
					<div class="card-header"><h2>Element</h2></div>
					<div class="card-body">
						<dl class="kv">
							{#if item.elementTag}<dt>Tag</dt><dd><code class="inline">{item.elementTag}</code></dd>{/if}
							{#if item.elementText}<dt>Text</dt><dd class="break">{item.elementText}</dd>{/if}
							{#if item.elementSelector}<dt>Selector</dt><dd><code class="mono break">{item.elementSelector}</code></dd>{/if}
							{#if item.elementXpath}<dt>XPath</dt><dd><code class="mono break">{item.elementXpath}</code></dd>{/if}
							{#if item.elementRect}
								<dt>Box</dt>
								<dd>{Math.round(item.elementRect.width)}×{Math.round(item.elementRect.height)} at ({Math.round(item.elementRect.x)}, {Math.round(item.elementRect.y)})</dd>
							{/if}
							{#if item.elementRelX !== null && item.elementRelY !== null}
								<dt>Click in element</dt>
								<dd>{Math.round(item.elementRelX * 100)}% across, {Math.round(item.elementRelY * 100)}% down</dd>
							{/if}
							{#each attributeEntries as [key, value]}
								<dt class="mono">{key}</dt>
								<dd class="mono break">{value}</dd>
							{/each}
						</dl>
					</div>
				</div>
			{/if}

			{#if deploymentEntries.length}
				<div class="card">
					<div class="card-header"><h2>Deployment</h2></div>
					<div class="card-body">
						<dl class="kv">
							{#each deploymentEntries as [key, value]}
								<dt>{key}</dt>
								<dd class="break">
									{#if key === 'url' && value}<a href={value} target="_blank" rel="noopener">{value}</a>{:else}{value}{/if}
								</dd>
							{/each}
						</dl>
					</div>
				</div>
			{/if}

			{#if item.metadata && Object.keys(item.metadata).length}
				<div class="card">
					<div class="card-header"><h2>Metadata</h2></div>
					<div class="card-body"><pre class="mono">{JSON.stringify(item.metadata, null, 2)}</pre></div>
				</div>
			{/if}

			{#if item.userAgent}
				<div class="card">
					<div class="card-header"><h2>Browser</h2></div>
					<div class="card-body small muted break">{item.userAgent}</div>
				</div>
			{/if}
		</div>
	</div>
</div>
