import { z } from 'zod';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '$lib/server/auth/password';
import { TURNSTILE_TOKEN_MAX_LENGTH } from '$lib/server/turnstile-verify';
import { isHttpUrl } from '$lib/format';
import { isSafeSelector, isSafeXPath } from '$lib/shared/locators';

const shortText = (max: number) => z.string().trim().max(max);
const optionalShortText = (max: number) =>
	z
		.string()
		.trim()
		.max(max)
		.optional()
		.transform((v) => (v ? v : undefined));

/**
 * Collapses control characters, line breaks and runs of whitespace into single
 * spaces. Used for display names and titles, which reach email subjects,
 * plain-text emails and Markdown exports where a newline could forge content.
 */
export function singleLine(value: string): string {
	return value.replace(/[\p{Cc}\p{Zl}\p{Zp}\s]+/gu, ' ').trim();
}

const nameText = (max: number) => z.string().transform(singleLine).pipe(z.string().max(max));
const optionalNameText = (max: number) =>
	z
		.string()
		.optional()
		.transform((v) => (v ? singleLine(v) : undefined))
		.pipe(z.string().max(max).optional())
		.transform((v) => (v ? v : undefined));

export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const passwordSchema = z
	.string()
	.min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
	.max(PASSWORD_MAX_LENGTH);

/** Turnstile response token; only checked server-side when bot protection is configured. */
const turnstileTokenSchema = z.string().max(TURNSTILE_TOKEN_MAX_LENGTH).optional();

/** Ids of @-mentioned users; filtered against the author's candidates by `resolveMentions()`. */
const mentionsSchema = z.array(z.string().uuid()).max(20).optional();

const finiteInt = z.number().finite().transform((n) => Math.round(n));

const elementRectSchema = z.object({
	x: z.number().finite(),
	y: z.number().finite(),
	width: z.number().finite().min(0),
	height: z.number().finite().min(0)
});

const attributesSchema = z
	.record(z.string().max(64), z.string().max(500))
	.refine((obj) => Object.keys(obj).length <= 24, { message: 'Too many attributes' });

const deploymentSchema = z
	.record(z.string().max(64), z.string().max(500).optional())
	.refine((obj) => Object.keys(obj).length <= 16, { message: 'Too many deployment fields' })
	// The dashboard links `url`; only web addresses may be stored there.
	.transform((obj) => {
		if (obj.url === undefined || isHttpUrl(obj.url)) return obj;
		const { url: _dropped, ...rest } = obj;
		return rest;
	});

const metadataSchema = z
	.record(z.string().max(64), z.unknown())
	.refine((obj) => JSON.stringify(obj).length <= 8_000, { message: 'Metadata too large' });

export const feedbackCreateSchema = z.object({
	body: z.string().trim().min(1, 'Comment cannot be empty').max(5000),
	author: z
		.object({
			name: optionalNameText(120),
			email: z
				.string()
				.trim()
				.max(254)
				.optional()
				.transform((v) => (v ? v.toLowerCase() : undefined))
		})
		.optional(),
	page: z.object({
		url: z.string().trim().url().max(2048),
		title: optionalNameText(300),
		// Optional so custom forms can post without layout details.
		viewportWidth: finiteInt.pipe(z.number().min(0).max(100_000)).optional(),
		viewportHeight: finiteInt.pipe(z.number().min(0).max(100_000)).optional(),
		devicePixelRatio: z.number().finite().min(0).max(10).optional(),
		scrollX: finiteInt.pipe(z.number().min(-1_000_000).max(1_000_000)).optional(),
		scrollY: finiteInt.pipe(z.number().min(-1_000_000).max(1_000_000)).optional(),
		userAgent: optionalShortText(500)
	}),
	click: z
		.object({
			x: finiteInt.pipe(z.number().min(-1_000_000).max(1_000_000)),
			y: finiteInt.pipe(z.number().min(-1_000_000).max(1_000_000))
		})
		.optional(),
	element: z
		.object({
			// Evaluated in other reviewers' browsers: keep only the shapes the widget generates.
			selector: optionalShortText(1000).transform((v) => (v && isSafeSelector(v) ? v : undefined)),
			xpath: optionalShortText(1000).transform((v) => (v && isSafeXPath(v) ? v : undefined)),
			tag: optionalShortText(64),
			text: optionalShortText(500),
			attributes: attributesSchema.optional(),
			rect: elementRectSchema.optional(),
			relX: z.number().finite().min(-1).max(2).optional(),
			relY: z.number().finite().min(-1).max(2).optional()
		})
		.optional(),
	deployment: deploymentSchema.optional(),
	metadata: metadataSchema.optional(),
	turnstileToken: turnstileTokenSchema,
	mentions: mentionsSchema
});

export type FeedbackCreateInput = z.infer<typeof feedbackCreateSchema>;

export const commentCreateSchema = z.object({
	body: z.string().trim().min(1, 'Reply cannot be empty').max(5000),
	author: z
		.object({
			name: optionalNameText(120),
			email: z
				.string()
				.trim()
				.max(254)
				.optional()
				.transform((v) => (v ? v.toLowerCase() : undefined))
		})
		.optional(),
	turnstileToken: turnstileTokenSchema,
	mentions: mentionsSchema
});

export const notificationPreferencesSchema = z.object({
	email: z.boolean()
});

export const resendVerificationSchema = z.object({
	email: emailSchema
});

export const widgetLoginSchema = z.object({
	email: emailSchema,
	password: z.string().min(1, 'Password is required').max(PASSWORD_MAX_LENGTH),
	turnstileToken: turnstileTokenSchema
});

export const widgetSignupSchema = z.object({
	name: nameText(120).pipe(z.string().min(1, 'Name is required')),
	email: emailSchema,
	password: passwordSchema,
	turnstileToken: turnstileTokenSchema
});

export const feedbackPatchSchema = z.object({
	status: z.enum(['open', 'resolved'])
});

export const authRequestCreateSchema = z.object({
	id: z.string().uuid(),
	pollSecret: z.string().min(32).max(200)
});

export const authPollSchema = z.object({
	pollSecret: z.string().min(32).max(200)
});

export const projectNameSchema = shortText(100).pipe(z.string().min(1, 'Name is required'));
