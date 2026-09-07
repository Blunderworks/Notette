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

/** Response of both widget sign-in and sign-up. */
export interface WidgetAuthResultDto {
	token: string;
	viewer: WidgetViewerDto;
}

export interface ApiErrorDto {
	error: {
		message: string;
		code?: string;
		details?: unknown;
	};
}
