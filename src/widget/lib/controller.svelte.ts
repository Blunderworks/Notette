import type {
	FeedbackCreatePayload,
	FeedbackDetailDto,
	FeedbackStatus,
	FeedbackSummaryDto,
	MentionCandidateDto,
	MentionRef,
	WidgetAuthResultDto,
	WidgetConfigDto,
	WidgetLoginPayload,
	WidgetSignupPayload,
	WidgetViewerDto
} from '$lib/shared/types';
import { ApiClient, NotetteApiError } from './api';
import type { ResolvedConfig } from './config';
import { computeSelector, computeXPath, describeElement, elementLabel, pageRect, pinPosition } from './dom';
import { captureViewport, currentViewport, type CaptureViewport, type Screenshot } from './screenshot';
import { readLocal, readSession, writeLocal, writeSession } from './storage';

export interface ConfirmOptions {
	title: string;
	message?: string;
	confirmLabel?: string;
	cancelLabel?: string;
	/** Styles the confirm button as destructive (default true). */
	danger?: boolean;
}

interface ConfirmRequest extends ConfirmOptions {
	resolve: (ok: boolean) => void;
}

export interface ComposerTarget {
	element: Element | null;
	label: string;
	pageX: number;
	pageY: number;
	relX: number | null;
	relY: number | null;
	/** Viewport and scroll position at the moment of the click. */
	view: CaptureViewport;
	/**
	 * Screenshot started at click time (when the project allows screenshots)
	 * so it shows the page as the reviewer saw it, before the composer, the
	 * on-screen keyboard or the page's own scripts change anything.
	 */
	screenshot: Promise<Screenshot | null> | null;
}

/**
 * `form` shows the inline sign-in/sign-up dialog, `verify` the "check your
 * inbox" notice after a sign-up that needs email confirmation; the remaining
 * non-idle states belong to the dashboard-approval (popup + polling) flow.
 */
export type AuthStatus = 'idle' | 'form' | 'verify' | 'waiting' | 'blocked' | 'denied' | 'expired' | 'error';
export type AuthMode = 'login' | 'signup';

export interface Toast {
	id: number;
	message: string;
	kind: 'info' | 'success' | 'error';
}

export interface AuthorIdentity {
	name: string;
	email: string;
}

const FOCUS_SESSION_KEY = 'notette:focus';

function randomId(): string {
	if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
	// RFC 4122 v4 fallback.
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	bytes[6] = (bytes[6] & 0x0f) | 0x40;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;
	const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function randomSecret(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Owns all widget state and side effects. Components read `ui` (a reactive
 * $state object) and call methods on the controller.
 */
export class WidgetController {
	readonly api: ApiClient;
	private token: string | null;
	private disposed = false;
	private authAbort: AbortController | null = null;
	private mutationObserver: MutationObserver | null = null;
	private toastTimer: ReturnType<typeof setTimeout> | null = null;
	private toastSeq = 0;
	private pendingFocusId: string | null = null;
	private pathCheckHandle: number | null = null;

	ui = $state({
		ready: false,
		fatalError: null as string | null,
		project: null as WidgetConfigDto['project'] | null,
		dashboardUrl: '',
		viewer: null as WidgetViewerDto | null,
		expanded: false,
		picking: false,
		pinsVisible: true,
		/** Status filter shared by the list and the pins; persisted per project. */
		statusFilter: 'open' as FeedbackStatus | 'all',
		panelOpen: false,
		composer: null as ComposerTarget | null,
		selectedId: null as string | null,
		detail: null as FeedbackDetailDto | null,
		detailLoading: false,
		pageItems: [] as FeedbackSummaryDto[],
		pageLoading: false,
		currentPath: typeof location !== 'undefined' ? location.pathname : '/',
		auth: { status: 'idle' as AuthStatus, mode: 'login' as AuthMode, url: '', message: '' },
		/** Address a confirmation link was sent to (auth status `verify`). */
		verifyEmail: '',
		/** The server can send email: notification preferences and verification apply. */
		emailEnabled: false,
		/** People the signed-in viewer may @-mention; empty for anonymous reviewers. */
		mentionCandidates: [] as MentionCandidateDto[],
		accountMenuOpen: false,
		/** Cloudflare Turnstile site key when the server has bot protection configured. */
		turnstileSiteKey: null as string | null,
		toast: null as Toast | null,
		/** Open confirmation dialog (`ConfirmDialog.svelte`), null when none. */
		confirm: null as ConfirmRequest | null,
		/** Pin that should draw attention (recently focused). */
		highlightId: null as string | null,
		/** Ticks whenever pins need to recompute their positions. */
		layoutTick: 0
	});

	constructor(
		readonly config: ResolvedConfig,
		readonly host: HTMLElement
	) {
		this.token = readLocal<string | null>(this.storageKey('token'), null);
		this.api = new ApiClient(config.host, config.key, () => this.token);
		this.ui.pinsVisible = readLocal<boolean>(this.storageKey('pins'), true);
		const storedStatus = readLocal<string>(this.storageKey('status'), 'open');
		if (storedStatus === 'open' || storedStatus === 'resolved' || storedStatus === 'all') this.ui.statusFilter = storedStatus;
		this.ui.expanded = config.open;
	}

	private storageKey(name: string): string {
		return `notette:${this.config.key}:${name}`;
	}

	// ---------------------------------------------------------------------
	// Lifecycle
	// ---------------------------------------------------------------------

	async start(): Promise<void> {
		this.installPathTracking();
		this.readFocusRequest();
		await this.loadConfig();
		if (this.disposed || this.ui.fatalError) return;
		this.ui.ready = true;
		await this.loadPageItems();
		if (this.pendingFocusId) {
			// Deep links open the widget; on sign-in-only projects that means the sign-in dialog.
			if (this.requiresSignIn) this.openSignIn();
			else this.ui.expanded = true;
		}
		this.applyPendingFocus();
	}

	destroy(): void {
		this.disposed = true;
		this.authAbort?.abort();
		this.mutationObserver?.disconnect();
		if (this.pathCheckHandle !== null) window.clearInterval(this.pathCheckHandle);
		window.removeEventListener('popstate', this.onLocationMaybeChanged);
		window.removeEventListener('hashchange', this.onLocationMaybeChanged);
		if (this.toastTimer) clearTimeout(this.toastTimer);
	}

	private async loadConfig(): Promise<void> {
		try {
			const config = await this.api.getConfig();
			this.ui.project = config.project;
			this.ui.dashboardUrl = config.dashboardUrl;
			this.ui.viewer = config.viewer;
			this.ui.turnstileSiteKey = config.turnstileSiteKey;
			this.ui.emailEnabled = config.emailEnabled;
			if (this.token && !config.viewer) {
				// Token expired or revoked.
				this.setToken(null);
			}
			if (config.viewer) void this.loadMentionCandidates();
		} catch (err) {
			const message =
				err instanceof NotetteApiError
					? err.code === 'origin_not_allowed'
						? `This site's origin is not in the project's allowed origins.`
						: err.code === 'unknown_project'
							? 'Unknown project key.'
							: err.message
					: 'Could not reach the Notette server.';
			this.ui.fatalError = message;
			console.error('[notette] Widget disabled:', message);
		}
	}

	// ---------------------------------------------------------------------
	// Location tracking (SPA-aware without touching history APIs)
	// ---------------------------------------------------------------------

	private onLocationMaybeChanged = (): void => {
		const path = location.pathname;
		if (path !== this.ui.currentPath) {
			this.ui.currentPath = path;
			this.ui.selectedId = null;
			this.ui.detail = null;
			this.ui.composer = null;
			void this.loadPageItems();
		}
		this.ui.layoutTick += 1;
	};

	private installPathTracking(): void {
		window.addEventListener('popstate', this.onLocationMaybeChanged);
		window.addEventListener('hashchange', this.onLocationMaybeChanged);
		let scheduled = false;
		this.mutationObserver = new MutationObserver(() => {
			if (scheduled) return;
			scheduled = true;
			window.setTimeout(() => {
				scheduled = false;
				this.onLocationMaybeChanged();
			}, 250);
		});
		this.mutationObserver.observe(document.documentElement, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ['class', 'style', 'hidden', 'open']
		});
		// Safety net for pushState-driven navigations that do not mutate the DOM immediately.
		this.pathCheckHandle = window.setInterval(() => {
			if (location.pathname !== this.ui.currentPath) this.onLocationMaybeChanged();
		}, 1000);
	}

	// ---------------------------------------------------------------------
	// Data
	// ---------------------------------------------------------------------

	/** Owners and admins: moderation actions, project-wide browsing, everything visible. */
	get isAdmin(): boolean {
		return !!this.ui.viewer?.admin;
	}

	/** Any signed-in account, including members. */
	get isSignedIn(): boolean {
		return !!this.ui.viewer;
	}

	/** The project disallows anonymous use and nobody is signed in yet. */
	get requiresSignIn(): boolean {
		return !!this.ui.project && !this.ui.project.anonymousFeedbackAllowed && !this.ui.viewer;
	}

	/** Anonymous submissions need a Turnstile token when the server has it configured. */
	get needsTurnstile(): boolean {
		return !!this.ui.turnstileSiteKey && !this.ui.viewer;
	}

	/** Members count as reviewers: only admins bypass `publicFeedbackVisible`. */
	get canSeeFeedback(): boolean {
		return this.isAdmin || (!!this.ui.project?.publicFeedbackVisible && !this.requiresSignIn);
	}

	get canReply(): boolean {
		return this.isAdmin || (!!this.ui.project?.reviewerRepliesEnabled && this.canSeeFeedback);
	}

	async loadPageItems(): Promise<void> {
		if (!this.canSeeFeedback) {
			this.ui.pageItems = [];
			return;
		}
		this.ui.pageLoading = true;
		const path = this.ui.currentPath;
		try {
			const result = await this.api.listPage(path);
			if (this.disposed || path !== this.ui.currentPath) return;
			this.ui.pageItems = result.items;
			this.ui.layoutTick += 1;
		} catch (err) {
			console.warn('[notette] Could not load feedback for this page', err);
		} finally {
			this.ui.pageLoading = false;
		}
	}

	/** Loads who the viewer may @-mention; silently empty when signed out or on failure. */
	async loadMentionCandidates(): Promise<void> {
		if (!this.isSignedIn) {
			this.ui.mentionCandidates = [];
			return;
		}
		try {
			const result = await this.api.getMentionCandidates();
			if (!this.disposed && this.isSignedIn) this.ui.mentionCandidates = result.users;
		} catch {
			this.ui.mentionCandidates = [];
		}
	}

	async refreshItem(id: string): Promise<void> {
		try {
			const detail = await this.api.getDetail(id);
			this.upsertPageItem(detail);
			if (this.ui.selectedId === id) this.ui.detail = detail;
		} catch {
			/* ignore */
		}
	}

	private upsertPageItem(item: FeedbackSummaryDto): void {
		const index = this.ui.pageItems.findIndex((i) => i.id === item.id);
		const summary = this.toSummary(item);
		if (item.path !== this.ui.currentPath) {
			if (index >= 0) this.ui.pageItems.splice(index, 1);
			return;
		}
		if (index >= 0) this.ui.pageItems[index] = summary;
		else this.ui.pageItems = [summary, ...this.ui.pageItems];
		this.ui.layoutTick += 1;
	}

	private toSummary(item: FeedbackSummaryDto): FeedbackSummaryDto {
		// Strip detail-only fields so page items stay lightweight and uniform.
		const { comments: _c, screenshotUrl: _s, elementAttributes: _a, metadata: _m, userAgent: _u, devicePixelRatio: _d, ...rest } =
			item as FeedbackDetailDto;
		return rest;
	}

	// ---------------------------------------------------------------------
	// UI state transitions
	// ---------------------------------------------------------------------

	/** Opens the toolbar, or the sign-in dialog when the project requires an account. */
	expand(): void {
		if (this.requiresSignIn) {
			this.openSignIn();
			return;
		}
		this.ui.expanded = true;
	}

	collapse(): void {
		this.ui.expanded = false;
		this.ui.accountMenuOpen = false;
		this.ui.picking = false;
		this.ui.panelOpen = false;
		this.ui.composer = null;
		this.closeThread();
	}

	toggleExpanded(): void {
		if (this.ui.expanded) this.collapse();
		else this.expand();
	}

	startPicking(): void {
		if (this.requiresSignIn) {
			this.openSignIn();
			return;
		}
		this.ui.expanded = true;
		this.ui.composer = null;
		this.closeThread();
		this.ui.panelOpen = false;
		this.ui.picking = true;
	}

	stopPicking(): void {
		this.ui.picking = false;
	}

	togglePicking(): void {
		if (this.ui.picking) this.stopPicking();
		else this.startPicking();
	}

	setStatusFilter(status: FeedbackStatus | 'all'): void {
		this.ui.statusFilter = status;
		writeLocal(this.storageKey('status'), status);
	}

	/** Page items that pass the status filter; the open thread's item always stays visible. */
	get visiblePageItems(): FeedbackSummaryDto[] {
		const status = this.ui.statusFilter;
		if (status === 'all') return this.ui.pageItems;
		return this.ui.pageItems.filter((i) => i.status === status || i.id === this.ui.selectedId);
	}

	togglePins(): void {
		this.ui.pinsVisible = !this.ui.pinsVisible;
		writeLocal(this.storageKey('pins'), this.ui.pinsVisible);
		if (!this.ui.pinsVisible) this.closeThread();
	}

	togglePanel(): void {
		if (this.requiresSignIn) {
			this.openSignIn();
			return;
		}
		this.ui.panelOpen = !this.ui.panelOpen;
		if (this.ui.panelOpen) {
			this.ui.picking = false;
			this.ui.composer = null;
		}
	}

	closePanel(): void {
		this.ui.panelOpen = false;
	}

	toggleAccountMenu(): void {
		this.ui.accountMenuOpen = !this.ui.accountMenuOpen;
	}

	closeAccountMenu(): void {
		this.ui.accountMenuOpen = false;
	}

	/** Per-project email notification preference of the signed-in viewer. */
	async setEmailNotifications(enabled: boolean): Promise<void> {
		if (!this.ui.viewer) return;
		try {
			const result = await this.api.setNotifications(enabled);
			this.ui.viewer.emailNotifications = result.email;
			this.toast(result.email ? 'Email notifications on' : 'Email notifications off', 'success');
		} catch (err) {
			this.handleAuthError(err);
			this.toast(err instanceof NotetteApiError ? err.message : 'Could not save the setting', 'error');
		}
	}

	beginCompose(element: Element | null, clientX: number, clientY: number): void {
		const pageX = Math.round(clientX + window.scrollX);
		const pageY = Math.round(clientY + window.scrollY);
		let relX: number | null = null;
		let relY: number | null = null;
		let label = 'page';
		const target = element && element !== document.documentElement && element !== document.body ? element : null;
		if (target) {
			const r = target.getBoundingClientRect();
			if (r.width > 0) relX = Math.min(Math.max((clientX - r.left) / r.width, 0), 1);
			if (r.height > 0) relY = Math.min(Math.max((clientY - r.top) / r.height, 0), 1);
			label = elementLabel(target);
		}
		this.ui.picking = false;
		this.closeThread();
		const view = currentViewport();
		const screenshot = this.ui.project?.screenshotsEnabled
			? captureViewport({ exclude: this.host, marker: { x: pageX, y: pageY }, viewport: view })
			: null;
		this.ui.composer = { element: target, label, pageX, pageY, relX, relY, view, screenshot };
	}

	cancelCompose(): void {
		this.ui.composer = null;
	}

	// ---------------------------------------------------------------------
	// Author identity for reviewers
	// ---------------------------------------------------------------------

	getAuthor(): AuthorIdentity {
		const stored = readLocal<Partial<AuthorIdentity>>('notette:author', {});
		return {
			name: this.config.user?.name ?? stored.name ?? '',
			email: this.config.user?.email ?? stored.email ?? ''
		};
	}

	rememberAuthor(author: AuthorIdentity): void {
		writeLocal('notette:author', { name: author.name.trim(), email: author.email.trim() });
	}

	// ---------------------------------------------------------------------
	// Feedback actions
	// ---------------------------------------------------------------------

	async submitFeedback(input: {
		target: ComposerTarget;
		body: string;
		author: AuthorIdentity;
		screenshot: boolean;
		turnstileToken?: string | null;
		mentions?: MentionRef[];
	}): Promise<FeedbackDetailDto> {
		const { target } = input;
		const element = target.element;
		const payload: FeedbackCreatePayload = {
			body: input.body.trim(),
			// Signed-in users (admins and members) post under their account; the server ignores author for them.
			author: this.isSignedIn
				? undefined
				: {
						name: input.author.name.trim() || undefined,
						email: input.author.email.trim() || undefined
					},
			turnstileToken: this.isSignedIn ? undefined : (input.turnstileToken ?? undefined),
			mentions: this.isSignedIn && input.mentions?.length ? input.mentions.map((m) => m.id) : undefined,
			page: {
				url: location.href,
				title: document.title || undefined,
				viewportWidth: target.view.width,
				viewportHeight: target.view.height,
				devicePixelRatio: window.devicePixelRatio || 1,
				scrollX: target.view.scrollX,
				scrollY: target.view.scrollY,
				userAgent: navigator.userAgent
			},
			click: { x: target.pageX, y: target.pageY },
			deployment: this.config.deployment,
			metadata: this.config.metadata
		};
		if (element && element.isConnected) {
			const description = describeElement(element);
			payload.element = {
				selector: computeSelector(element) ?? undefined,
				xpath: computeXPath(element),
				tag: description.tag,
				text: description.text,
				attributes: description.attributes,
				rect: pageRect(element),
				relX: target.relX ?? undefined,
				relY: target.relY ?? undefined
			};
		}

		if (!this.isSignedIn) this.rememberAuthor(input.author);

		// The screenshot was started when the reviewer clicked; a missing one
		// (composer opened before screenshots were enabled) is taken now instead.
		// Either way it never blocks submission.
		const wantScreenshot = input.screenshot && !!this.ui.project?.screenshotsEnabled;
		const shot = wantScreenshot
			? await (target.screenshot ??
					captureViewport({ exclude: this.host, marker: { x: target.pageX, y: target.pageY }, viewport: target.view }))
			: null;

		let created: Awaited<ReturnType<ApiClient['create']>>;
		try {
			created = await this.api.create(payload);
		} catch (err) {
			this.handleAuthError(err);
			throw err;
		}
		this.ui.composer = null;
		this.upsertPageItem(created.item);

		if (wantScreenshot) {
			if (shot) {
				try {
					await this.api.uploadScreenshot(created.item.id, shot.blob, created.uploadToken, shot);
					created.item.hasScreenshot = true;
					this.upsertPageItem(created.item);
				} catch (err) {
					console.warn('[notette] Screenshot upload failed', err);
					this.toast(`Feedback #${created.item.number} sent (screenshot upload failed)`, 'info');
					return created.item;
				}
			} else {
				this.toast(`Feedback #${created.item.number} sent (screenshot unavailable)`, 'info');
				return created.item;
			}
		}
		this.toast(`Feedback #${created.item.number} sent`, 'success');
		return created.item;
	}

	async openThread(id: string): Promise<void> {
		this.ui.picking = false;
		this.ui.composer = null;
		this.ui.selectedId = id;
		this.ui.detail = null;
		this.ui.detailLoading = true;
		try {
			const detail = await this.api.getDetail(id);
			if (this.ui.selectedId !== id) return;
			this.ui.detail = detail;
			this.upsertPageItem(detail);
		} catch (err) {
			this.toast(err instanceof NotetteApiError ? err.message : 'Could not load this thread', 'error');
			this.ui.selectedId = null;
		} finally {
			this.ui.detailLoading = false;
		}
	}

	closeThread(): void {
		this.ui.selectedId = null;
		this.ui.detail = null;
		this.ui.highlightId = null;
	}

	async reply(
		id: string,
		body: string,
		author: AuthorIdentity,
		turnstileToken?: string | null,
		mentions?: MentionRef[]
	): Promise<void> {
		let comment: Awaited<ReturnType<ApiClient['addComment']>>;
		try {
			comment = await this.api.addComment(
				id,
				body.trim(),
				this.isSignedIn ? undefined : { name: author.name.trim() || undefined, email: author.email.trim() || undefined },
				this.isSignedIn ? undefined : (turnstileToken ?? undefined),
				this.isSignedIn && mentions?.length ? mentions.map((m) => m.id) : undefined
			);
		} catch (err) {
			this.handleAuthError(err);
			throw err;
		}
		if (!this.isSignedIn) this.rememberAuthor(author);
		if (this.ui.detail?.id === id) {
			this.ui.detail.comments = [...this.ui.detail.comments, comment];
			this.ui.detail.commentCount = this.ui.detail.comments.length;
		}
		const item = this.ui.pageItems.find((i) => i.id === id);
		if (item) item.commentCount += 1;
	}

	async setStatus(id: string, status: FeedbackStatus): Promise<void> {
		const detail = await this.api.setStatus(id, status);
		if (this.ui.selectedId === id) this.ui.detail = detail;
		this.upsertPageItem(detail);
		this.toast(status === 'resolved' ? `#${detail.number} resolved` : `#${detail.number} reopened`, 'success');
	}

	/** Shows the widget's confirmation dialog and resolves with the answer. */
	confirm(options: ConfirmOptions): Promise<boolean> {
		this.ui.confirm?.resolve(false);
		return new Promise((resolve) => {
			this.ui.confirm = { ...options, resolve };
		});
	}

	/** Answers the open confirmation dialog (used by `ConfirmDialog.svelte`). */
	answerConfirm(ok: boolean): void {
		const pending = this.ui.confirm;
		this.ui.confirm = null;
		pending?.resolve(ok);
	}

	async remove(id: string): Promise<void> {
		await this.api.remove(id);
		this.ui.pageItems = this.ui.pageItems.filter((i) => i.id !== id);
		if (this.ui.selectedId === id) this.closeThread();
		this.ui.layoutTick += 1;
		this.toast('Feedback deleted', 'success');
	}

	async loadScreenshot(id: string): Promise<string | null> {
		try {
			const blob = await this.api.getScreenshot(id);
			return URL.createObjectURL(blob);
		} catch {
			return null;
		}
	}

	// ---------------------------------------------------------------------
	// Focus / navigation between items
	// ---------------------------------------------------------------------

	private readFocusRequest(): void {
		let id: string | null = null;
		try {
			id = new URL(location.href).searchParams.get('notette');
		} catch {
			id = null;
		}
		const stored = readSession(FOCUS_SESSION_KEY);
		if (stored) writeSession(FOCUS_SESSION_KEY, null);
		this.pendingFocusId = id || stored || null;
	}

	private applyPendingFocus(): void {
		const id = this.pendingFocusId;
		if (!id) return;
		// Keep the request until the user has signed in on sign-in-only projects.
		if (this.requiresSignIn) return;
		this.pendingFocusId = null;
		if (this.ui.pageItems.some((i) => i.id === id)) {
			void this.focusItem(id);
		} else if (this.canSeeFeedback) {
			// Item may belong to another page or be unknown; try opening it directly.
			void this.openThread(id);
		}
	}

	/** Navigates to an item's page if needed, then scrolls to and opens it. */
	async focusItem(id: string, itemHint?: FeedbackSummaryDto): Promise<void> {
		if (this.requiresSignIn) {
			// Remember the request; applyPendingFocus() runs it once the user has signed in.
			this.pendingFocusId = id;
			this.openSignIn();
			return;
		}
		const local = this.ui.pageItems.find((i) => i.id === id);
		const item = local ?? itemHint;
		if (!item) {
			await this.openThread(id);
			return;
		}
		if (item.path !== this.ui.currentPath) {
			this.navigateTo(item);
			return;
		}
		this.ui.expanded = true;
		this.ui.panelOpen = false;
		if (!this.ui.pinsVisible) this.togglePins();
		const position = pinPosition(item);
		if (position?.element) {
			position.element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
		} else if (item.clickY !== null) {
			window.scrollTo({ top: Math.max(0, item.clickY - window.innerHeight / 2), behavior: 'smooth' });
		}
		this.ui.highlightId = id;
		window.setTimeout(() => {
			if (this.ui.highlightId === id) this.ui.highlightId = null;
		}, 2500);
		await this.openThread(id);
	}

	private navigateTo(item: FeedbackSummaryDto): void {
		writeSession(FOCUS_SESSION_KEY, item.id);
		let target: string;
		try {
			const url = new URL(item.url);
			target = url.origin === location.origin ? url.toString() : `${location.origin}${url.pathname}${url.search}`;
		} catch {
			target = item.path;
		}
		location.assign(target);
	}

	// ---------------------------------------------------------------------
	// Authentication: inline sign-in/sign-up (email + password against the
	// widget API) or approval from the dashboard (popup + polling). Neither
	// relies on third-party cookies; the bearer token lives in localStorage.
	// ---------------------------------------------------------------------

	private setToken(token: string | null): void {
		this.token = token;
		writeLocal(this.storageKey('token'), token);
	}

	/** Shows the inline sign-in (or sign-up) dialog. */
	openSignIn(mode: AuthMode = 'login'): void {
		if (this.ui.auth.status === 'waiting') return;
		this.authAbort?.abort();
		this.authAbort = null;
		const signupAllowed = !!this.ui.project?.openSignups;
		this.ui.auth = { status: 'form', mode: mode === 'signup' && signupAllowed ? 'signup' : 'login', url: '', message: '' };
	}

	setAuthMode(mode: AuthMode): void {
		if (this.ui.auth.status !== 'form') return;
		if (mode === 'signup' && !this.ui.project?.openSignups) return;
		this.ui.auth.mode = mode;
	}

	async signInWithPassword(input: WidgetLoginPayload): Promise<void> {
		const result = await this.api.login(input);
		await this.applySignedIn(result, `Signed in as ${result.viewer.name}`);
	}

	async signUp(input: WidgetSignupPayload): Promise<void> {
		const result = await this.api.signup(input);
		if ('verificationRequired' in result) {
			// The account exists but cannot sign in until the emailed link is opened.
			this.ui.verifyEmail = result.email;
			this.ui.auth = { status: 'verify', mode: 'login', url: '', message: '' };
			return;
		}
		await this.applySignedIn(result, `Welcome, ${result.viewer.name}`);
	}

	/** Requests a new confirmation link for an unverified account. */
	async resendVerification(email: string): Promise<void> {
		try {
			await this.api.resendVerification(email);
			this.toast(`Confirmation email sent to ${email}`, 'success');
		} catch (err) {
			this.toast(err instanceof NotetteApiError ? err.message : 'Could not send the email', 'error');
		}
	}

	private async applySignedIn(result: WidgetAuthResultDto, message: string): Promise<void> {
		this.setToken(result.token);
		this.ui.viewer = result.viewer;
		this.ui.auth = { status: 'idle', mode: 'login', url: '', message: '' };
		this.toast(message, 'success');
		this.ui.expanded = true;
		await this.loadPageItems();
		void this.loadMentionCandidates();
		this.applyPendingFocus();
	}

	/**
	 * Called when a request fails because the session is gone (revoked access,
	 * expired token, or the project stopped allowing anonymous use).
	 */
	private handleAuthError(err: unknown): void {
		if (!(err instanceof NotetteApiError)) return;
		if (err.status !== 401) return;
		if (this.token) this.setToken(null);
		this.ui.viewer = null;
		this.ui.mentionCandidates = [];
		this.ui.accountMenuOpen = false;
		if (this.requiresSignIn) this.openSignIn();
	}

	/** Dashboard approval flow: opens the authorize page and polls for the token. */
	approveFromDashboard(): void {
		if (this.ui.auth.status === 'waiting') return;
		const id = randomId();
		const secret = randomSecret();
		const url = `${this.config.host}/widget/authorize?request=${encodeURIComponent(id)}`;
		// Open synchronously within the user gesture so popup blockers allow it.
		let popup: Window | null = null;
		try {
			popup = window.open(url, 'notette-authorize', 'popup=yes,width=480,height=640');
		} catch {
			popup = null;
		}
		this.ui.auth = { status: popup ? 'waiting' : 'blocked', mode: 'login', url, message: '' };
		void this.runAuthFlow(id, secret, popup);
	}

	private async runAuthFlow(id: string, secret: string, popup: Window | null): Promise<void> {
		this.authAbort?.abort();
		const abort = new AbortController();
		this.authAbort = abort;
		try {
			await this.api.createAuthRequest(id, secret);
		} catch (err) {
			this.ui.auth = {
				status: 'error',
				mode: 'login',
				url: '',
				message: err instanceof NotetteApiError ? err.message : 'Could not start sign-in'
			};
			popup?.close();
			return;
		}
		const deadline = Date.now() + 10 * 60 * 1000;
		while (!abort.signal.aborted && Date.now() < deadline) {
			await new Promise((r) => setTimeout(r, 1500));
			if (abort.signal.aborted) return;
			try {
				const result = await this.api.pollAuthRequest(id, secret, abort.signal);
				if (result.status === 'approved' && result.token && result.viewer) {
					try {
						popup?.close();
					} catch {
						/* cross-origin popup may not be closable */
					}
					await this.applySignedIn({ token: result.token, viewer: result.viewer }, `Signed in as ${result.viewer.name}`);
					return;
				}
				if (result.status === 'denied' || result.status === 'expired') {
					this.ui.auth = { status: result.status, mode: 'login', url: '', message: '' };
					return;
				}
			} catch (err) {
				if (err instanceof DOMException && err.name === 'AbortError') return;
				if (err instanceof NotetteApiError && err.status === 404) {
					this.ui.auth = { status: 'expired', mode: 'login', url: '', message: '' };
					return;
				}
				// Transient errors: keep polling.
			}
		}
		if (!abort.signal.aborted) this.ui.auth = { status: 'expired', mode: 'login', url: '', message: '' };
	}

	cancelSignIn(): void {
		this.authAbort?.abort();
		this.authAbort = null;
		this.ui.auth = { status: 'idle', mode: 'login', url: '', message: '' };
	}

	async signOut(): Promise<void> {
		try {
			await this.api.logout();
		} catch {
			/* token may already be invalid */
		}
		this.setToken(null);
		this.ui.viewer = null;
		this.ui.mentionCandidates = [];
		this.ui.accountMenuOpen = false;
		this.ui.panelOpen = false;
		this.closeThread();
		this.toast('Signed out', 'info');
		// Without an account the toolbar is unusable on sign-in-only projects.
		if (this.requiresSignIn) this.collapse();
		await this.loadPageItems();
	}

	// ---------------------------------------------------------------------
	// Toasts
	// ---------------------------------------------------------------------

	toast(message: string, kind: Toast['kind'] = 'info'): void {
		this.toastSeq += 1;
		this.ui.toast = { id: this.toastSeq, message, kind };
		if (this.toastTimer) clearTimeout(this.toastTimer);
		this.toastTimer = setTimeout(() => {
			this.ui.toast = null;
		}, 3500);
	}
}
