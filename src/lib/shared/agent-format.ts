import type { FeedbackDetailDto } from './types';

export interface AgentFormatOptions {
	projectName?: string;
	/** Absolute link to the feedback item in the dashboard. */
	dashboardUrl?: string;
}

/**
 * Reviewer-supplied values must not add structure to the export (a newline
 * could start a fake "## Instructions" section for the agent), so everything
 * except the quoted body is collapsed onto one line.
 */
function inline(text: string): string {
	return text.replace(/[\p{Cc}\p{Zl}\p{Zp}\s]+/gu, ' ').trim();
}

/** Inline code span that the value cannot close early. */
function code(text: string): string {
	const value = inline(text);
	const longest = Math.max(0, ...(value.match(/`+/g) ?? []).map((run) => run.length));
	const ticks = '`'.repeat(longest + 1);
	const pad = value.startsWith('`') || value.endsWith('`') ? ' ' : '';
	return `${ticks}${pad}${value}${pad}${ticks}`;
}

/** Fence longer than any backtick run inside the block. */
function fenceFor(text: string): string {
	const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
	return '`'.repeat(Math.max(3, longest + 1));
}

function line(label: string, value: string | number | null | undefined): string | null {
	if (value === null || value === undefined || value === '') return null;
	return `- ${inline(label)}: ${typeof value === 'string' ? inline(value) : value}`;
}

function quote(text: string): string {
	return text
		.trim()
		.split('\n')
		.map((l) => `> ${l}`)
		.join('\n');
}

function compactText(text: string | null | undefined, max = 200): string | null {
	if (!text) return null;
	const collapsed = text.replace(/\s+/g, ' ').trim();
	if (!collapsed) return null;
	return collapsed.length > max ? `${collapsed.slice(0, max - 1)}…` : collapsed;
}

/**
 * Renders a feedback item and its context as concise Markdown that a coding
 * agent can act on directly. Used by both the widget and the dashboard.
 */
function roleSuffix(author: { isAdmin: boolean; isMember?: boolean; isVerified?: boolean }): string {
	if (author.isAdmin) return ' (admin)';
	if (author.isMember) return ' (member)';
	if (author.isVerified) return ' (verified app user)';
	// Self-reported name: labelled so a name like "Caleb (admin)" cannot pass as a role.
	return ' (anonymous)';
}

function authorLabel(author: { authorName: string | null; isAdmin: boolean; isMember?: boolean; isVerified?: boolean }, fallback: string): string {
	const name = author.authorName ? inline(author.authorName) : '';
	return name ? `${name}${roleSuffix(author)}` : fallback;
}

export function formatFeedbackForAgent(item: FeedbackDetailDto, opts: AgentFormatOptions = {}): string {
	const out: string[] = [];
	const who = authorLabel(item, 'Anonymous reviewer');
	const title = opts.projectName ? `${opts.projectName} feedback #${item.number}` : `Feedback #${item.number}`;

	out.push(`# ${title} (${item.status})`);
	out.push('');
	out.push(quote(item.body));
	out.push(`— ${who}, ${item.createdAt}`);

	if (item.comments.length > 0) {
		out.push('');
		out.push('## Replies');
		for (const c of item.comments) {
			out.push(`- **${authorLabel(c, 'Anonymous')}** (${c.createdAt}): ${inline(c.body)}`);
		}
	}

	out.push('');
	out.push('## Page');
	const viewport =
		item.viewportWidth && item.viewportHeight
			? `${item.viewportWidth}×${item.viewportHeight}${item.devicePixelRatio ? ` @${item.devicePixelRatio}x` : ''}`
			: null;
	for (const l of [
		line('URL', item.url),
		line('Path', item.path),
		line('Title', compactText(item.pageTitle, 120)),
		line('Viewport', viewport),
		line(
			'Scroll position',
			item.scrollX !== null && item.scrollY !== null ? `(${item.scrollX}, ${item.scrollY})` : null
		)
	]) {
		if (l) out.push(l);
	}

	const hasElement = item.elementSelector || item.elementXpath || item.elementTag;
	if (hasElement || item.clickX !== null) {
		out.push('');
		out.push('## Target element');
		const attrs = item.elementAttributes
			? Object.entries(item.elementAttributes)
					.map(([k, v]) => `${k}="${v}"`)
					.join(' ')
			: '';
		const tagLine = item.elementTag ? `<${item.elementTag}${attrs ? ' ' + attrs : ''}>` : null;
		const rect = item.elementRect
			? `x=${Math.round(item.elementRect.x)} y=${Math.round(item.elementRect.y)} w=${Math.round(item.elementRect.width)} h=${Math.round(item.elementRect.height)} (page px)`
			: null;
		const click =
			item.clickX !== null && item.clickY !== null
				? `page (${item.clickX}, ${item.clickY})${
						item.elementRelX !== null && item.elementRelY !== null
							? `, ${Math.round(item.elementRelX * 100)}% across / ${Math.round(item.elementRelY * 100)}% down the element`
							: ''
					}`
				: null;
		for (const l of [
			tagLine ? `- Element: ${code(tagLine)}` : null,
			line('Text', compactText(item.elementText)),
			item.elementSelector ? `- CSS selector: ${code(item.elementSelector)}` : null,
			item.elementXpath ? `- XPath: ${code(item.elementXpath)}` : null,
			line('Bounding box', rect),
			line('Click position', click)
		]) {
			if (l) out.push(l);
		}
	}

	if (item.deployment && Object.values(item.deployment).some(Boolean)) {
		out.push('');
		out.push('## Deployment');
		for (const [k, v] of Object.entries(item.deployment)) {
			const l = line(k, v);
			if (l) out.push(l);
		}
	}

	if (item.metadata && Object.keys(item.metadata).length > 0) {
		out.push('');
		out.push('## Metadata');
		const json = JSON.stringify(item.metadata, null, 2);
		const fence = fenceFor(json);
		out.push(`${fence}json`);
		out.push(json);
		out.push(fence);
	}

	const links = [
		line('Screenshot', item.screenshotUrl),
		line('Dashboard', opts.dashboardUrl),
		line('User agent', item.userAgent)
	].filter(Boolean) as string[];
	if (links.length) {
		out.push('');
		out.push('## Links & environment');
		out.push(...links);
	}

	return out.join('\n');
}
