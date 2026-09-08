/**
 * HTML and plain-text email rendering. Pure functions without database or
 * SvelteKit imports so they can be unit-tested; every dynamic value is
 * escaped here. Styles are inlined because email clients ignore stylesheets.
 */

import { segmentMentions } from '$lib/shared/mentions';

export interface RenderedEmail {
	subject: string;
	html: string;
	text: string;
}

export const palette = {
	bg: '#f4f5f8',
	surface: '#ffffff',
	surface2: '#f8f9fb',
	border: '#e1e4ea',
	text: '#14181f',
	muted: '#5b6472',
	faint: '#8a93a2',
	accent: '#4f46e5',
	accentSoft: '#eef2ff',
	accentText: '#3730a3',
	warningSoft: '#fffbeb',
	warningText: '#92400e'
};

export const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
export const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

/** Escapes a body for HTML, keeps line breaks and bolds `@Name` mentions. */
export function renderBodyHtml(body: string, mentions: readonly string[] = []): string {
	return segmentMentions(body, mentions)
		.map((segment) =>
			segment.mention
				? `<strong style="color:${palette.accentText};font-weight:600;">${escapeHtml(segment.text)}</strong>`
				: escapeHtml(segment.text)
		)
		.join('')
		.replace(/\r?\n/g, '<br>');
}

export function button(href: string, label: string, primary = true): string {
	const style = primary
		? `background:${palette.accent};border:1px solid ${palette.accent};color:#ffffff;`
		: `background:${palette.surface};border:1px solid ${palette.border};color:${palette.text};`;
	return `<a href="${escapeHtml(href)}" style="display:inline-block;${style}padding:9px 16px;border-radius:6px;font-family:${FONT};font-size:13px;font-weight:600;text-decoration:none;line-height:1.2;">${escapeHtml(label)}</a>`;
}

export function pill(label: string): string {
	return `<span style="display:inline-block;background:${palette.accentSoft};color:${palette.accentText};padding:1px 8px;border-radius:999px;font-size:11px;font-weight:600;line-height:1.6;">${escapeHtml(label)}</span>`;
}

export interface LayoutInput {
	title: string;
	/** Hidden first line shown by inbox previews. */
	preheader?: string;
	/** Small line above the card, e.g. "Notette · Project name". */
	eyebrow?: string;
	/** Card contents (already HTML). */
	body: string;
	/** Text under the card (already HTML). */
	footer?: string;
}

/** Wraps card content in the shared 600px layout with header and footer. */
export function layout(input: LayoutInput): string {
	const preheader = input.preheader
		? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(input.preheader)}</div>`
		: '';
	const eyebrow = input.eyebrow ? `<span style="color:${palette.muted};font-size:13px;">${escapeHtml(input.eyebrow)}</span>` : '';
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(input.title)}</title>
</head>
<body style="margin:0;padding:0;background:${palette.bg};font-family:${FONT};color:${palette.text};-webkit-font-smoothing:antialiased;">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${palette.bg};">
<tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
<tr><td style="padding:0 4px 14px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="width:26px;height:26px;border-radius:7px;background:${palette.accent};color:#ffffff;font-weight:700;font-size:14px;text-align:center;vertical-align:middle;line-height:26px;">N</td>
<td style="padding-left:9px;font-weight:600;font-size:15px;">Notette</td>
${eyebrow ? `<td style="padding-left:8px;">${eyebrow}</td>` : ''}
</tr></table>
</td></tr>
<tr><td style="background:${palette.surface};border:1px solid ${palette.border};border-radius:10px;padding:24px;font-size:14px;line-height:1.5;">
${input.body}
</td></tr>
${input.footer ? `<tr><td style="padding:16px 6px 0;color:${palette.faint};font-size:12px;line-height:1.5;">${input.footer}</td></tr>` : ''}
</table>
</td></tr>
</table>
</body>
</html>`;
}

function hostOf(origin: string | null): string | null {
	if (!origin) return null;
	try {
		return new URL(origin).host;
	} catch {
		return origin;
	}
}

export interface VerificationEmailInput {
	name: string;
	link: string;
	/** Site the sign-up came from (widget origin), if known. */
	origin: string | null;
	expiresHours: number;
}

/** Account confirmation email for widget sign-ups. */
export function renderVerificationEmail(input: VerificationEmailInput): RenderedEmail {
	const site = hostOf(input.origin);
	const subject = site ? `Confirm your email to leave feedback on ${site}` : 'Confirm your email for Notette';
	const where = site ? ` to leave feedback on <strong>${escapeHtml(site)}</strong>` : '';
	const body = `
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;">Confirm your email address</h1>
<p style="margin:0 0 16px;color:${palette.muted};">Hi ${escapeHtml(input.name)}, you created a Notette account${where}. Confirm your address to finish signing up; afterwards you can sign in from the widget.</p>
<p style="margin:0 0 20px;">${button(input.link, 'Confirm email')}</p>
<p style="margin:0 0 6px;color:${palette.faint};font-size:12px;">Or paste this link into your browser:</p>
<p style="margin:0 0 16px;font-family:${MONO};font-size:12px;word-break:break-all;"><a href="${escapeHtml(input.link)}" style="color:${palette.accent};">${escapeHtml(input.link)}</a></p>
<p style="margin:0;color:${palette.faint};font-size:12px;">This link expires in ${input.expiresHours} hours. If you did not create this account, you can ignore this email.</p>`;
	const html = layout({ title: subject, preheader: 'Confirm your email to finish signing up.', body });
	const text = [
		`Hi ${input.name},`,
		'',
		`You created a Notette account${site ? ` to leave feedback on ${site}` : ''}. Confirm your email address by opening this link:`,
		'',
		input.link,
		'',
		`The link expires in ${input.expiresHours} hours. If you did not create this account, you can ignore this email.`
	].join('\n');
	return { subject, html, text };
}
