import { describe, expect, it } from 'vitest';
import { buildDigest, digestSubject, type DigestItem } from './digest';
import { escapeHtml, renderBodyHtml, renderVerificationEmail } from './templates';

function item(overrides: Partial<DigestItem> = {}): DigestItem {
	return {
		kind: 'comment',
		projectId: 'p1',
		projectName: 'Marketing site',
		feedbackId: 'f1',
		number: 12,
		url: 'https://site.test/pricing?plan=pro',
		path: '/pricing',
		pageTitle: 'Pricing',
		feedbackBody: 'The button is misaligned',
		feedbackAuthor: 'Ada',
		feedbackMentions: [],
		commentId: 'c1',
		commentBody: 'Fixed in the next deploy, @Ada',
		commentAuthor: 'Grace',
		commentMentions: ['Ada'],
		createdAt: new Date('2026-09-07T10:00:00Z'),
		...overrides
	};
}

describe('escapeHtml / renderBodyHtml', () => {
	it('escapes markup and keeps line breaks', () => {
		expect(escapeHtml('<b>&"\'')).toBe('&lt;b&gt;&amp;&quot;&#39;');
		expect(renderBodyHtml('a <b>\nc')).toBe('a &lt;b&gt;<br>c');
	});
	it('bolds mentions without letting names inject HTML', () => {
		const html = renderBodyHtml('hi @X<y', ['X<y']);
		expect(html).toContain('<strong');
		expect(html).toContain('@X&lt;y');
		expect(html).not.toContain('<y');
	});
});

describe('digestSubject', () => {
	it('describes single items by kind', () => {
		expect(digestSubject([item()])).toBe('[Marketing site] Grace replied on #12');
		expect(digestSubject([item({ kind: 'mention' })])).toBe('[Marketing site] Grace mentioned you on #12');
		expect(digestSubject([item({ kind: 'feedback', commentId: null, commentBody: null, commentAuthor: null })])).toBe(
			'[Marketing site] New feedback #12: The button is misaligned'
		);
		expect(digestSubject([item({ kind: 'mention', commentId: null, commentBody: null, commentAuthor: null })])).toBe(
			'[Marketing site] Ada mentioned you in feedback #12'
		);
	});
	it('counts multiple items and mentions', () => {
		expect(digestSubject([item(), item({ commentId: 'c2' })])).toBe('[Marketing site] 2 new feedback updates');
		expect(digestSubject([item(), item({ commentId: 'c2', kind: 'mention' })])).toBe(
			'[Marketing site] 2 new feedback updates (1 mention)'
		);
		expect(digestSubject([item(), item({ projectId: 'p2', projectName: 'App' })])).toBe('2 new feedback updates');
	});
});

describe('buildDigest', () => {
	it('groups replies of one thread into one block with site and dashboard links for admins', () => {
		const email = buildDigest([item(), item({ commentId: 'c2', commentBody: 'Second', commentAuthor: 'Linus', commentMentions: [] })], {
			recipientName: 'Owner',
			recipientIsAdmin: true,
			baseUrl: 'https://notette.test'
		});
		expect(email.html.match(/#12<\/strong>/g)).toHaveLength(1);
		expect(email.html).toContain('https://site.test/pricing?plan=pro&amp;notette=f1');
		expect(email.html).toContain('https://notette.test/projects/p1/feedback/f1');
		expect(email.html).toContain('<strong style="color:#14181f;">Grace</strong> replied');
		expect(email.html).toContain('Linus');
		// Replies without the root in the digest show the root as quoted context.
		expect(email.html).toContain('The button is misaligned');
		expect(email.text).toContain('Open on site: https://site.test/pricing?plan=pro&notette=f1');
		expect(email.text).toContain('View in dashboard: https://notette.test/projects/p1/feedback/f1');
		expect(email.html).toContain('2 new updates in 1 thread.');
	});
	it('omits dashboard links for members and when the base URL is unknown', () => {
		const member = buildDigest([item()], { recipientName: 'Ada', recipientIsAdmin: false, baseUrl: 'https://notette.test' });
		expect(member.html).not.toContain('/projects/p1/feedback/f1');
		expect(member.text).not.toContain('View in dashboard');
		const noBase = buildDigest([item()], { recipientName: 'Owner', recipientIsAdmin: true, baseUrl: null });
		expect(noBase.html).not.toContain('View in dashboard');
	});
	it('labels mentions and escapes user content', () => {
		const email = buildDigest([item({ kind: 'mention', commentBody: '<script>alert(1)</script> @Ada', commentMentions: ['Ada'] })], {
			recipientName: 'Ada',
			recipientIsAdmin: false,
			baseUrl: null
		});
		expect(email.html).toContain('mentioned you');
		expect(email.html).not.toContain('<script>');
		expect(email.html).toContain('&lt;script&gt;');
		expect(email.html).toContain('>@Ada</strong>');
		expect(email.text).toContain('Grace replied and mentioned you:');
	});
	it('renders new feedback as the entry itself and groups projects under headings', () => {
		const email = buildDigest(
			[
				item({ kind: 'feedback', commentId: null, commentBody: null, commentAuthor: null }),
				item({ projectId: 'p2', projectName: 'App', feedbackId: 'f9', number: 3, path: '/', pageTitle: null })
			],
			{ recipientName: 'Owner', recipientIsAdmin: true, baseUrl: 'https://notette.test' }
		);
		expect(email.html).toContain('left new feedback');
		expect(email.html).toContain('>Marketing site</h2>');
		expect(email.html).toContain('>App</h2>');
		expect(email.text).toContain('== App ==');
		expect(email.text).toContain('#3 /');
	});
	it('refuses an empty digest', () => {
		expect(() => buildDigest([], { recipientName: 'x', recipientIsAdmin: false, baseUrl: null })).toThrow();
	});
});

describe('renderVerificationEmail', () => {
	it('mentions the site and includes the link in both parts', () => {
		const email = renderVerificationEmail({
			name: 'Ada <3',
			link: 'https://notette.test/verify-email?token=ntv_abc',
			origin: 'https://site.test',
			expiresHours: 24
		});
		expect(email.subject).toBe('Confirm your email to leave feedback on site.test');
		expect(email.html).toContain('Ada &lt;3');
		expect(email.html).toContain('href="https://notette.test/verify-email?token=ntv_abc"');
		expect(email.text).toContain('https://notette.test/verify-email?token=ntv_abc');
		expect(email.text).toContain('site.test');
	});
	it('falls back to a generic subject without an origin', () => {
		expect(renderVerificationEmail({ name: 'A', link: 'https://x/y', origin: null, expiresHours: 24 }).subject).toBe(
			'Confirm your email for Notette'
		);
	});
});
