/**
 * Builds the batched notification email ("digest") for one recipient. Pure:
 * takes plain rows and returns subject/html/text, so it is unit-tested
 * without a database. The queue and sending live in services/notifications.ts.
 */

import { siteLinkForFeedback, truncate } from '$lib/format';
import { button, escapeHtml, layout, MONO, palette, pill, renderBodyHtml, type RenderedEmail } from './templates';

export type DigestKind = 'feedback' | 'comment' | 'mention';

export interface DigestItem {
	kind: DigestKind;
	projectId: string;
	projectName: string;
	feedbackId: string;
	number: number;
	url: string;
	path: string;
	pageTitle: string | null;
	/** Thread root text, shown as context for replies. */
	feedbackBody: string;
	feedbackAuthor: string | null;
	feedbackMentions: string[];
	/** Reply data; null for new-feedback items (the root itself is the news). */
	commentId: string | null;
	commentBody: string | null;
	commentAuthor: string | null;
	commentMentions: string[];
	createdAt: Date;
}

export interface DigestOptions {
	recipientName: string;
	/** Admins get dashboard links and the dashboard settings hint. */
	recipientIsAdmin: boolean;
	/** Public base URL of the instance; dashboard links are omitted when unknown. */
	baseUrl: string | null;
}

interface Thread {
	feedbackId: string;
	number: number;
	url: string;
	path: string;
	pageTitle: string | null;
	feedbackBody: string;
	feedbackAuthor: string | null;
	feedbackMentions: string[];
	items: DigestItem[];
}

interface ProjectGroup {
	id: string;
	name: string;
	threads: Thread[];
}

function groupItems(items: DigestItem[]): ProjectGroup[] {
	const projects = new Map<string, ProjectGroup>();
	for (const item of items) {
		let project = projects.get(item.projectId);
		if (!project) {
			project = { id: item.projectId, name: item.projectName, threads: [] };
			projects.set(item.projectId, project);
		}
		let thread = project.threads.find((t) => t.feedbackId === item.feedbackId);
		if (!thread) {
			thread = {
				feedbackId: item.feedbackId,
				number: item.number,
				url: item.url,
				path: item.path,
				pageTitle: item.pageTitle,
				feedbackBody: item.feedbackBody,
				feedbackAuthor: item.feedbackAuthor,
				feedbackMentions: item.feedbackMentions,
				items: []
			};
			project.threads.push(thread);
		}
		thread.items.push(item);
	}
	return [...projects.values()];
}

function authorOf(item: DigestItem): string {
	return (item.commentId ? item.commentAuthor : item.feedbackAuthor) ?? 'Anonymous';
}

function isRoot(item: DigestItem): boolean {
	return item.commentId === null;
}

export function digestSubject(items: DigestItem[]): string {
	const projectNames = [...new Set(items.map((i) => i.projectName))];
	if (items.length === 1) {
		const item = items[0];
		const prefix = `[${item.projectName}]`;
		if (item.kind === 'mention') {
			return isRoot(item)
				? `${prefix} ${authorOf(item)} mentioned you in feedback #${item.number}`
				: `${prefix} ${authorOf(item)} mentioned you on #${item.number}`;
		}
		if (isRoot(item)) return `${prefix} New feedback #${item.number}: ${truncate(item.feedbackBody, 60)}`;
		return `${prefix} ${authorOf(item)} replied on #${item.number}`;
	}
	const mentions = items.filter((i) => i.kind === 'mention').length;
	const scope = projectNames.length === 1 ? `[${projectNames[0]}] ` : '';
	const base = `${scope}${items.length} new feedback updates`;
	return mentions ? `${base} (${mentions} mention${mentions === 1 ? '' : 's'})` : base;
}

function dashboardLink(baseUrl: string | null, projectId: string, feedbackId: string): string | null {
	return baseUrl ? `${baseUrl}/projects/${projectId}/feedback/${feedbackId}` : null;
}

function entryHtml(item: DigestItem): string {
	const root = isRoot(item);
	const body = root ? item.feedbackBody : (item.commentBody ?? '');
	const mentions = root ? item.feedbackMentions : item.commentMentions;
	const verb = root ? 'left new feedback' : 'replied';
	return `
<div style="margin:12px 0 0;">
<div style="font-size:12px;color:${palette.muted};line-height:1.4;"><strong style="color:${palette.text};">${escapeHtml(authorOf(item))}</strong> ${verb}${item.kind === 'mention' ? ` &nbsp;${pill('mentioned you')}` : ''}</div>
<div style="margin-top:4px;white-space:pre-wrap;word-break:break-word;font-size:14px;line-height:1.5;">${renderBodyHtml(body, mentions)}</div>
</div>`;
}

function threadHtml(project: ProjectGroup, thread: Thread, opts: DigestOptions): string {
	const title = thread.pageTitle?.trim() || thread.path;
	const hasRoot = thread.items.some(isRoot);
	const context = hasRoot
		? ''
		: `<div style="margin:12px 0 0;padding:6px 12px;border-left:3px solid ${palette.border};color:${palette.muted};font-size:13px;line-height:1.45;"><strong>${escapeHtml(thread.feedbackAuthor ?? 'Anonymous')}</strong>: ${escapeHtml(truncate(thread.feedbackBody, 200))}</div>`;
	const site = siteLinkForFeedback(thread.url, thread.feedbackId);
	const dashboard = opts.recipientIsAdmin ? dashboardLink(opts.baseUrl, project.id, thread.feedbackId) : null;
	return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;border:1px solid ${palette.border};border-radius:8px;">
<tr><td style="padding:10px 16px;background:${palette.surface2};border-bottom:1px solid ${palette.border};border-radius:8px 8px 0 0;">
<div style="font-size:14px;"><strong>#${thread.number}</strong> <span style="color:${palette.muted};">${escapeHtml(truncate(title, 80))}</span></div>
<div style="font-family:${MONO};font-size:11.5px;color:${palette.faint};margin-top:2px;">${escapeHtml(thread.path)}</div>
</td></tr>
<tr><td style="padding:2px 16px 16px;">
${context}
${thread.items.map(entryHtml).join('')}
<div style="margin-top:16px;">${button(site, 'Open on site')}${dashboard ? ` &nbsp; ${button(dashboard, 'View in dashboard', false)}` : ''}</div>
</td></tr>
</table>`;
}

function footerHtml(groups: ProjectGroup[], opts: DigestOptions): string {
	const names = groups.map((g) => g.name);
	const reason = opts.recipientIsAdmin
		? `you are an admin of ${names.map((n) => `<strong>${escapeHtml(n)}</strong>`).join(', ')}`
		: `you take part in these threads or were mentioned`;
	const settings =
		opts.recipientIsAdmin && opts.baseUrl
			? groups
					.map(
						(g) =>
							`<a href="${escapeHtml(`${opts.baseUrl}/projects/${g.id}/settings`)}" style="color:${palette.faint};">${escapeHtml(g.name)} settings</a>`
					)
					.join(' · ')
			: null;
	return `You receive this email because ${reason}. Turn email notifications off from the account menu in the widget${
		settings ? ` or under ${settings} in the dashboard` : ''
	}. Updates are grouped and sent about a minute after the first one.`;
}

function threadText(project: ProjectGroup, thread: Thread, opts: DigestOptions): string {
	const lines: string[] = [];
	const title = thread.pageTitle?.trim() || thread.path;
	lines.push(`#${thread.number} ${title}${thread.pageTitle ? ` (${thread.path})` : ''}`);
	if (!thread.items.some(isRoot)) {
		lines.push(`  ${thread.feedbackAuthor ?? 'Anonymous'}: ${truncate(thread.feedbackBody, 200)}`);
	}
	for (const item of thread.items) {
		const root = isRoot(item);
		const body = root ? item.feedbackBody : (item.commentBody ?? '');
		const label = root ? 'left new feedback' : 'replied';
		lines.push(`  ${authorOf(item)} ${label}${item.kind === 'mention' ? ' and mentioned you' : ''}:`);
		for (const line of body.split(/\r?\n/)) lines.push(`  > ${line}`);
	}
	lines.push(`  Open on site: ${siteLinkForFeedback(thread.url, thread.feedbackId)}`);
	const dashboard = opts.recipientIsAdmin ? dashboardLink(opts.baseUrl, project.id, thread.feedbackId) : null;
	if (dashboard) lines.push(`  View in dashboard: ${dashboard}`);
	return lines.join('\n');
}

/** Renders one email summarising every pending item for a recipient. */
export function buildDigest(items: DigestItem[], opts: DigestOptions): RenderedEmail {
	if (!items.length) throw new Error('A digest needs at least one item');
	const ordered = [...items].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
	const groups = groupItems(ordered);
	const subject = digestSubject(ordered);
	const projectNames = groups.map((g) => g.name);
	const threadCount = groups.reduce((n, g) => n + g.threads.length, 0);
	const intro =
		ordered.length === 1
			? ''
			: `<p style="margin:0 0 16px;color:${palette.muted};">${ordered.length} new updates in ${threadCount} thread${threadCount === 1 ? '' : 's'}.</p>`;

	const bodyHtml = groups
		.map((project) => {
			const heading =
				groups.length > 1
					? `<h2 style="margin:8px 0 10px;font-size:15px;color:${palette.muted};font-weight:600;">${escapeHtml(project.name)}</h2>`
					: '';
			return heading + project.threads.map((thread) => threadHtml(project, thread, opts)).join('');
		})
		.join('');

	const html = layout({
		title: subject,
		preheader: truncate(ordered[0].commentBody ?? ordered[0].feedbackBody, 120),
		eyebrow: projectNames.length === 1 ? projectNames[0] : `${projectNames.length} projects`,
		body: intro + bodyHtml,
		footer: footerHtml(groups, opts)
	});

	const textParts: string[] = [];
	for (const project of groups) {
		textParts.push(`== ${project.name} ==`);
		for (const thread of project.threads) textParts.push(threadText(project, thread, opts), '');
	}
	textParts.push('--', footerHtml(groups, opts).replace(/<[^>]+>/g, ''));
	return { subject, html, text: textParts.join('\n') };
}
