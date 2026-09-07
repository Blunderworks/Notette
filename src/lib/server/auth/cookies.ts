import type { RequestEvent } from '@sveltejs/kit';
import { SESSION_COOKIE } from './sessions';

export function setSessionCookie(event: RequestEvent, token: string, expiresAt: Date): void {
	event.cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: event.url.protocol === 'https:',
		expires: expiresAt
	});
}

export function clearSessionCookie(event: RequestEvent): void {
	event.cookies.delete(SESSION_COOKIE, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: event.url.protocol === 'https:'
	});
}
