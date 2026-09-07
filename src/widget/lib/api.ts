import type {
	ApiErrorDto,
	AuthRequestPollDto,
	CommentDto,
	FeedbackCreatePayload,
	FeedbackDetailDto,
	FeedbackListDto,
	FeedbackStatus,
	WidgetAuthResultDto,
	WidgetConfigDto,
	WidgetLoginPayload,
	WidgetSignupPayload
} from '$lib/shared/types';

export class NotetteApiError extends Error {
	constructor(
		public readonly status: number,
		message: string,
		public readonly code?: string
	) {
		super(message);
		this.name = 'NotetteApiError';
	}
}

export interface CreateFeedbackResponse {
	item: FeedbackDetailDto;
	uploadToken: string | null;
}

interface RequestOptions {
	method?: string;
	body?: unknown;
	rawBody?: BodyInit;
	headers?: Record<string, string>;
	signal?: AbortSignal;
}

/** Thin client for the widget API. All requests are JSON unless rawBody is used. */
export class ApiClient {
	private readonly base: string;

	constructor(
		host: string,
		key: string,
		private readonly getToken: () => string | null
	) {
		this.base = `${host}/api/widget/${encodeURIComponent(key)}`;
	}

	private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
		const headers: Record<string, string> = { 'X-Notette-Client': 'widget', ...options.headers };
		const token = this.getToken();
		if (token) headers.Authorization = `Bearer ${token}`;
		let body: BodyInit | undefined;
		if (options.rawBody !== undefined) {
			body = options.rawBody;
		} else if (options.body !== undefined) {
			headers['Content-Type'] = 'application/json';
			body = JSON.stringify(options.body);
		}
		let response: Response;
		try {
			response = await fetch(`${this.base}${path}`, {
				method: options.method ?? 'GET',
				headers,
				body,
				credentials: 'omit',
				mode: 'cors',
				signal: options.signal
			});
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') throw err;
			throw new NotetteApiError(0, 'Could not reach the Notette server', 'network_error');
		}
		if (response.status === 204) return undefined as T;
		const contentType = response.headers.get('content-type') ?? '';
		if (!contentType.includes('application/json')) {
			if (!response.ok) throw new NotetteApiError(response.status, `Request failed (${response.status})`);
			return (await response.blob()) as T;
		}
		const data = (await response.json()) as T | ApiErrorDto;
		if (!response.ok) {
			const error = (data as ApiErrorDto)?.error;
			throw new NotetteApiError(response.status, error?.message ?? `Request failed (${response.status})`, error?.code);
		}
		return data as T;
	}

	getConfig(): Promise<WidgetConfigDto> {
		return this.request('/config');
	}

	listPage(path: string): Promise<FeedbackListDto> {
		return this.request(`/feedback?scope=page&path=${encodeURIComponent(path)}`);
	}

	listProject(filters: { status?: FeedbackStatus | 'all'; q?: string }): Promise<FeedbackListDto> {
		const params = new URLSearchParams({ scope: 'project' });
		if (filters.status) params.set('status', filters.status);
		if (filters.q) params.set('q', filters.q);
		return this.request(`/feedback?${params.toString()}`);
	}

	getDetail(id: string): Promise<FeedbackDetailDto> {
		return this.request(`/feedback/${encodeURIComponent(id)}`);
	}

	create(payload: FeedbackCreatePayload): Promise<CreateFeedbackResponse> {
		return this.request('/feedback', { method: 'POST', body: payload });
	}

	uploadScreenshot(
		id: string,
		blob: Blob,
		uploadToken: string | null,
		size: { width: number; height: number }
	): Promise<{ id: string }> {
		const headers: Record<string, string> = { 'Content-Type': blob.type || 'image/jpeg' };
		if (uploadToken) headers['X-Notette-Upload-Token'] = uploadToken;
		return this.request(`/feedback/${encodeURIComponent(id)}/screenshot?w=${size.width}&h=${size.height}`, {
			method: 'PUT',
			rawBody: blob,
			headers
		});
	}

	getScreenshot(id: string): Promise<Blob> {
		return this.request(`/feedback/${encodeURIComponent(id)}/screenshot`);
	}

	addComment(
		id: string,
		body: string,
		author?: { name?: string; email?: string },
		turnstileToken?: string
	): Promise<CommentDto> {
		return this.request(`/feedback/${encodeURIComponent(id)}/comments`, {
			method: 'POST',
			body: { body, author, turnstileToken }
		});
	}

	setStatus(id: string, status: FeedbackStatus): Promise<FeedbackDetailDto> {
		return this.request(`/feedback/${encodeURIComponent(id)}`, { method: 'PATCH', body: { status } });
	}

	remove(id: string): Promise<void> {
		return this.request(`/feedback/${encodeURIComponent(id)}`, { method: 'DELETE' });
	}

	createAuthRequest(id: string, pollSecret: string): Promise<{ id: string; authorizeUrl: string; expiresAt: string }> {
		return this.request('/auth/requests', { method: 'POST', body: { id, pollSecret } });
	}

	pollAuthRequest(id: string, pollSecret: string, signal?: AbortSignal): Promise<AuthRequestPollDto> {
		return this.request(`/auth/requests/${encodeURIComponent(id)}/poll`, {
			method: 'POST',
			body: { pollSecret },
			signal
		});
	}

	/** Inline sign-in with email + password; returns a widget token bound to this project and origin. */
	login(payload: WidgetLoginPayload): Promise<WidgetAuthResultDto> {
		return this.request('/auth/login', { method: 'POST', body: payload });
	}

	/** Inline sign-up (projects open for signups only). */
	signup(payload: WidgetSignupPayload): Promise<WidgetAuthResultDto> {
		return this.request('/auth/signup', { method: 'POST', body: payload });
	}

	logout(): Promise<void> {
		return this.request('/auth/session', { method: 'DELETE' });
	}
}
