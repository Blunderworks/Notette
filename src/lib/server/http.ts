import { json, type RequestEvent, type RequestHandler } from '@sveltejs/kit';
import { ZodError, type ZodType } from 'zod';
import type { ApiErrorDto } from '$lib/shared/types';
import type { User } from '$lib/server/db/schema';

export class ApiError extends Error {
	constructor(
		public readonly status: number,
		message: string,
		public readonly code?: string,
		public readonly details?: unknown
	) {
		super(message);
		this.name = 'ApiError';
	}
}

export function errorResponse(status: number, message: string, code?: string, details?: unknown): Response {
	const body: ApiErrorDto = { error: { message, code, details } };
	return json(body, { status });
}

/**
 * Wraps a request handler so thrown ApiErrors and validation errors become
 * JSON error responses instead of HTML error pages.
 */
export function api(handler: RequestHandler): RequestHandler {
	return async (event) => {
		try {
			return await handler(event);
		} catch (err) {
			if (err instanceof ApiError) {
				return errorResponse(err.status, err.message, err.code, err.details);
			}
			if (err instanceof ZodError) {
				return errorResponse(400, 'Invalid request body', 'validation_error', err.flatten());
			}
			// SvelteKit redirects/errors thrown via error()/redirect() carry a status.
			if (err && typeof err === 'object' && 'status' in err && 'body' in err) {
				const e = err as { status: number; body: { message?: string } };
				return errorResponse(e.status, e.body?.message ?? 'Request failed');
			}
			console.error('[notette] Unhandled API error', err);
			return errorResponse(500, 'Internal server error', 'internal_error');
		}
	};
}

export async function readJson<T>(request: Request, schema: ZodType<T>, maxBytes = 1_000_000): Promise<T> {
	const contentLength = Number(request.headers.get('content-length') ?? '0');
	if (contentLength > maxBytes) throw new ApiError(413, 'Request body too large', 'payload_too_large');
	let text: string;
	try {
		text = await request.text();
	} catch {
		throw new ApiError(400, 'Could not read request body', 'bad_request');
	}
	if (text.length > maxBytes) throw new ApiError(413, 'Request body too large', 'payload_too_large');
	let data: unknown;
	try {
		data = text ? JSON.parse(text) : {};
	} catch {
		throw new ApiError(400, 'Request body is not valid JSON', 'bad_json');
	}
	const result = schema.safeParse(data);
	if (!result.success) {
		throw new ApiError(400, 'Invalid request body', 'validation_error', result.error.flatten());
	}
	return result.data;
}

export function requireUser(event: RequestEvent): User {
	if (!event.locals.user) throw new ApiError(401, 'Authentication required', 'unauthorized');
	return event.locals.user;
}

export function clientAddress(event: RequestEvent): string {
	try {
		return event.getClientAddress();
	} catch {
		return 'unknown';
	}
}
