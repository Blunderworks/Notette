import type { FeedbackDetailDto } from './types';

export interface AgentFormatOptions {
	projectName?: string;
	/** Absolute link to the feedback item in the dashboard. */
	dashboardUrl?: string;
}

function line(label: string, value: string | number | null | undefined): string | null {
	if (value === null || value === undefined || value === '') return null;
	return `- ${label}: ${value}`;
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
export function formatFeedbackForAgent(item: FeedbackDetailDto, opts: AgentFormatOptions = {}): string {
	const out: string[] = [];
	const who = item.authorName ? `${item.authorName}${item.isAdmin ? ' (admin)' : ''}` : 'Anonymous reviewer';
	const title = opts.projectName ? `${opts.projectName} feedback #${item.number}` : `Feedback #${item.number}`;

	out.push(`# ${title} (${item.status})`);
	out.push('');
	out.push(quote(item.body));
	out.push(`— ${who}, ${item.createdAt}`);

	if (item.comments.length > 0) {
		out.push('');
		out.push('## Replies');
		for (const c of item.comments) {
			const author = c.authorName ? `${c.authorName}${c.isAdmin ? ' (admin)' : ''}` : 'Anonymous';
			out.push(`- **${author}** (${c.createdAt}): ${c.body.replace(/\s*\n\s*/g, ' ')}`);
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
			line('Element', tagLine ? `\`${tagLine}\`` : null),
			line('Text', compactText(item.elementText)),
			line('CSS selector', item.elementSelector ? `\`${item.elementSelector}\`` : null),
			line('XPath', item.elementXpath ? `\`${item.elementXpath}\`` : null),
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
		out.push('```json');
		out.push(JSON.stringify(item.metadata, null, 2));
		out.push('```');
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
