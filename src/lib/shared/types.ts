/**
 * Types shared between the SvelteKit backend/dashboard and the standalone widget.
 * This file must stay free of server-only or framework-specific imports.
 */

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
	isAdmin: boolean;
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
	isAdmin: boolean;
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
	admin: true;
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
	};
	viewer: WidgetViewerDto | null;
	/** Absolute URL of the dashboard, used for "open in dashboard" links. */
	dashboardUrl: string;
}

export interface AuthRequestPollDto {
	status: 'pending' | 'approved' | 'denied' | 'expired';
	token?: string;
	viewer?: WidgetViewerDto;
}

export interface ApiErrorDto {
	error: {
		message: string;
		code?: string;
		details?: unknown;
	};
}
