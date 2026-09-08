/**
 * Types shared between the SvelteKit backend/dashboard and the standalone widget.
 * This file must stay free of server-only or framework-specific imports.
 */

import type { UserRole } from './roles';

export type { UserRole } from './roles';

export type FeedbackStatus = 'open' | 'resolved';

export interface ElementRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** A user referenced with @Name in a feedback body or reply. */
export interface MentionRef {
	id: string;
	name: string;
}

/** Someone the current user may @-mention (see *Mentions* in ARCHITECTURE.md). */
export interface MentionCandidateDto {
	id: string;
	name: string;
	/** Owner or admin account. */
	admin: boolean;
}

export interface DeploymentInfo {
	environment?: string;
	branch?: string;
	commit?: string;
	url?: string;
	[key: string]: string | undefined;
}

/** Payload the widget sends to create a feedback item. */
export interface FeedbackCreatePayload {
	body: string;
	author?: {
		name?: string;
		email?: string;
	};
	/** Cloudflare Turnstile response, required for anonymous submissions when configured. */
	turnstileToken?: string;
	/** Ids of @-mentioned users (signed-in authors only; validated server-side). */
	mentions?: string[];
	page: {
		url: string;
		title?: string;
		viewportWidth: number;
		viewportHeight: number;
		devicePixelRatio?: number;
		scrollX: number;
		scrollY: number;
		userAgent?: string;
	};
	/** Click position in page (document) coordinates. */
	click?: {
		x: number;
		y: number;
	};
	element?: {
		selector?: string;
		xpath?: string;
		tag?: string;
		text?: string;
		attributes?: Record<string, string>;
		rect?: ElementRect;
		relX?: number;
		relY?: number;
	};
	deployment?: DeploymentInfo;
	metadata?: Record<string, unknown>;
}

export interface CommentDto {
	id: string;
	body: string;
	authorName: string | null;
	/** Posted by an owner/admin. */
	isAdmin: boolean;
	/** Posted by a signed-in member (non-admin account). */
	isMember: boolean;
	/** Display names of @-mentioned users, for highlighting in the body. */
	mentions: string[];
	createdAt: string;
}

export interface FeedbackSummaryDto {
	id: string;
	number: number;
	status: FeedbackStatus;
	body: string;
	url: string;
	path: string;
	pageTitle: string | null;
	authorName: string | null;
	/** Posted by an owner/admin. */
	isAdmin: boolean;
	/** Posted by a signed-in member (non-admin account). */
	isMember: boolean;
	createdAt: string;
	updatedAt: string;
	resolvedAt: string | null;
	commentCount: number;
	hasScreenshot: boolean;
	viewportWidth: number | null;
	viewportHeight: number | null;
	scrollX: number | null;
	scrollY: number | null;
	clickX: number | null;
	clickY: number | null;
	elementSelector: string | null;
	elementXpath: string | null;
	elementTag: string | null;
	elementText: string | null;
	elementRect: ElementRect | null;
	elementRelX: number | null;
	elementRelY: number | null;
	deployment: DeploymentInfo | null;
	/** Display names of @-mentioned users, for highlighting in the body. */
	mentions: string[];
}

export interface FeedbackDetailDto extends FeedbackSummaryDto {
	comments: CommentDto[];
	screenshotUrl: string | null;
	elementAttributes: Record<string, string> | null;
	devicePixelRatio: number | null;
	userAgent: string | null;
	metadata: Record<string, unknown> | null;
	authorEmail?: string | null;
}

export interface FeedbackListDto {
	items: FeedbackSummaryDto[];
	total: number;
}

export interface WidgetViewerDto {
	/** True for owners and admins (full access, moderation actions). */
	admin: boolean;
	role: UserRole;
	name: string;
	email: string;
	/** Email notifications for this project are on (only meaningful when the server can send email). */
	emailNotifications: boolean;
}

export interface WidgetConfigDto {
	project: {
		id: string;
		name: string;
		publicFeedbackVisible: boolean;
		reviewerRepliesEnabled: boolean;
		screenshotsEnabled: boolean;
		/** False means the widget requires a signed-in user before it can be used. */
		anonymousFeedbackAllowed: boolean;
		/** True means anyone can create an account from the widget and join the project. */
		openSignups: boolean;
	};
	viewer: WidgetViewerDto | null;
	/** Absolute URL of the dashboard, used for "open in dashboard" links. */
	dashboardUrl: string;
	/** Cloudflare Turnstile site key when bot protection is configured, otherwise null. */
	turnstileSiteKey: string | null;
	/** The server can send email, so notification preferences and verification apply. */
	emailEnabled: boolean;
}

export interface AuthRequestPollDto {
	status: 'pending' | 'approved' | 'denied' | 'expired';
	token?: string;
	viewer?: WidgetViewerDto;
}

/** Payload for the widget's inline sign-in form. */
export interface WidgetLoginPayload {
	email: string;
	password: string;
	turnstileToken?: string;
}

/** Payload for the widget's inline sign-up form (open projects only). */
export interface WidgetSignupPayload {
	name: string;
	email: string;
	password: string;
	turnstileToken?: string;
}

/** Response of widget sign-in, and of sign-up when no verification is needed. */
export interface WidgetAuthResultDto {
	token: string;
	viewer: WidgetViewerDto;
}

/** Sign-up response when the project requires email verification first. */
export interface WidgetSignupPendingDto {
	verificationRequired: true;
	email: string;
}

export type WidgetSignupResultDto = WidgetAuthResultDto | WidgetSignupPendingDto;

/** Payload for the widget's reply form. */
export interface CommentCreatePayload {
	body: string;
	author?: { name?: string; email?: string };
	turnstileToken?: string;
	mentions?: string[];
}

export interface NotificationPreferencesDto {
	/** Email digests for this project. */
	email: boolean;
}

export interface ApiErrorDto {
	error: {
		message: string;
		code?: string;
		details?: unknown;
	};
}
