import { describe, expect, it } from 'vitest';
import { commentCreateSchema, feedbackCreateSchema, singleLine, widgetSignupSchema } from './validation';

const page = { url: 'https://site.example/settings' };

describe('reviewer-supplied display text', () => {
	it('collapses control characters and line breaks', () => {
		expect(singleLine('  Bob\r\n  Open on site:\thttps://evil  x\u0007 ')).toBe('Bob Open on site: https://evil x');
	});

	it('applies to author names, sign-up names and page titles', () => {
		const feedback = feedbackCreateSchema.parse({ body: 'x', page: { ...page, title: 'A\nB' }, author: { name: 'Jane\n## Evil' } });
		expect(feedback.author?.name).toBe('Jane ## Evil');
		expect(feedback.page.title).toBe('A B');
		expect(commentCreateSchema.parse({ body: 'x', author: { name: '\n\t' } }).author?.name).toBeUndefined();
		expect(widgetSignupSchema.safeParse({ name: '\n', email: 'a@b.co', password: 'long-enough-1' }).success).toBe(false);
	});
});

describe('feedback element and deployment fields', () => {
	it('keeps generated locators and drops anything else', () => {
		const ok = feedbackCreateSchema.parse({ body: 'x', page, element: { selector: 'main > button:nth-of-type(2)', xpath: '/html/body[1]/main[1]' } });
		expect(ok.element).toMatchObject({ selector: 'main > button:nth-of-type(2)', xpath: '/html/body[1]/main[1]' });
		const bad = feedbackCreateSchema.parse({ body: 'x', page, element: { selector: 'div:has(p)', xpath: '//*[count(//*)=0]' } });
		expect(bad.element?.selector).toBeUndefined();
		expect(bad.element?.xpath).toBeUndefined();
	});

	it('only stores http(s) deployment URLs', () => {
		expect(feedbackCreateSchema.parse({ body: 'x', page, deployment: { url: 'javascript:alert(1)', branch: 'main' } }).deployment).toEqual({ branch: 'main' });
		expect(feedbackCreateSchema.parse({ body: 'x', page, deployment: { url: 'https://preview.example' } }).deployment).toEqual({ url: 'https://preview.example' });
	});
});
