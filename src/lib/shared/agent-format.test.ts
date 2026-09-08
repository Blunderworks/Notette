import { describe, expect, it } from 'vitest';
import { formatFeedbackForAgent } from './agent-format';
import type { FeedbackDetailDto } from './types';

const base: FeedbackDetailDto = {
	id: 'f1',
	number: 12,
	status: 'open',
	body: 'The save button overlaps the footer\non small screens.',
	url: 'https://preview.example.com/settings?tab=billing',
	path: '/settings',
	pageTitle: 'Settings · Acme',
	authorName: 'Jane',
	isAdmin: false,
	isMember: false,
	mentions: [],
	createdAt: '2026-09-07T10:00:00.000Z',
	updatedAt: '2026-09-07T10:00:00.000Z',
	resolvedAt: null,
	commentCount: 1,
	hasScreenshot: true,
	viewportWidth: 1440,
	viewportHeight: 900,
	scrollX: 0,
	scrollY: 320,
	clickX: 812,
	clickY: 640,
	elementSelector: '#billing-form > button.primary',
	elementXpath: '/html/body/main/form/button[1]',
	elementTag: 'button',
	elementText: 'Save changes',
	elementRect: { x: 790, y: 620, width: 120, height: 40 },
	elementRelX: 0.18,
	elementRelY: 0.5,
	deployment: { environment: 'preview', branch: 'feat/billing', commit: 'abc1234' },
	comments: [
		{ id: 'c1', body: 'Reproduced on iPhone 13', authorName: 'Dev', isAdmin: true, isMember: false, mentions: [], createdAt: '2026-09-07T11:00:00.000Z' }
	],
	screenshotUrl: 'https://notette.example.com/uploads/u1',
	elementAttributes: { class: 'primary', type: 'submit' },
	devicePixelRatio: 2,
	userAgent: 'Mozilla/5.0 Test',
	metadata: { appVersion: '1.2.3' }
};

describe('formatFeedbackForAgent', () => {
	it('renders all relevant context sections', () => {
		const text = formatFeedbackForAgent(base, { projectName: 'Acme', dashboardUrl: 'https://notette.example.com/x' });
		expect(text).toContain('# Acme feedback #12 (open)');
		expect(text).toContain('> The save button overlaps the footer');
		expect(text).toContain('— Jane, 2026-09-07T10:00:00.000Z');
		expect(text).toContain('## Replies');
		expect(text).toContain('**Dev (admin)**');
		expect(text).toContain('- URL: https://preview.example.com/settings?tab=billing');
		expect(text).toContain('- Viewport: 1440×900 @2x');
		expect(text).toContain('`<button class="primary" type="submit">`');
		expect(text).toContain('- CSS selector: `#billing-form > button.primary`');
		expect(text).toContain('18% across / 50% down the element');
		expect(text).toContain('- branch: feat/billing');
		expect(text).toContain('"appVersion": "1.2.3"');
		expect(text).toContain('- Screenshot: https://notette.example.com/uploads/u1');
		expect(text).toContain('- Dashboard: https://notette.example.com/x');
	});

	it('omits empty sections', () => {
		const text = formatFeedbackForAgent({
			...base,
			comments: [],
			deployment: null,
			metadata: null,
			screenshotUrl: null,
			userAgent: null,
			elementSelector: null,
			elementXpath: null,
			elementTag: null,
			elementText: null,
			elementAttributes: null,
			elementRect: null,
			clickX: null,
			clickY: null,
			authorName: null
		});
		expect(text).not.toContain('## Replies');
		expect(text).not.toContain('## Deployment');
		expect(text).not.toContain('## Metadata');
		expect(text).not.toContain('## Target element');
		expect(text).not.toContain('## Links');
		expect(text).toContain('Anonymous reviewer');
	});
});
