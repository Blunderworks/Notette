/**
 * Browser-side loader for Cloudflare Turnstile, shared by the dashboard login
 * page and the widget. Loads the script once (explicit rendering mode) and
 * resolves with the global API. Framework-free; no server imports.
 */

export interface TurnstileRenderOptions {
	sitekey: string;
	callback: (token: string) => void;
	'expired-callback'?: () => void;
	'timeout-callback'?: () => void;
	/** Return true to mark the error as handled (suppresses console noise). */
	'error-callback'?: (code?: string) => boolean | void;
	appearance?: 'always' | 'execute' | 'interaction-only';
	size?: 'normal' | 'flexible' | 'compact';
	theme?: 'light' | 'dark' | 'auto';
	action?: string;
}

export interface TurnstileApi {
	render(container: HTMLElement, options: TurnstileRenderOptions): string;
	reset(widgetId?: string): void;
	remove(widgetId: string): void;
	getResponse(widgetId?: string): string | undefined;
}

declare global {
	interface Window {
		turnstile?: TurnstileApi;
	}
}

export const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const SCRIPT_ATTR = 'data-notette-turnstile';

let pending: Promise<TurnstileApi> | null = null;

export function loadTurnstile(): Promise<TurnstileApi> {
	if (typeof window === 'undefined') return Promise.reject(new Error('Turnstile requires a browser'));
	if (window.turnstile) return Promise.resolve(window.turnstile);
	if (pending) return pending;
	pending = new Promise<TurnstileApi>((resolve, reject) => {
		const existing = document.querySelector<HTMLScriptElement>(`script[${SCRIPT_ATTR}]`);
		const script = existing ?? document.createElement('script');
		const settle = () => {
			if (window.turnstile) resolve(window.turnstile);
			else reject(new Error('Turnstile did not initialise'));
		};
		script.addEventListener('load', settle, { once: true });
		script.addEventListener(
			'error',
			() => {
				pending = null;
				reject(new Error('Could not load Turnstile'));
			},
			{ once: true }
		);
		if (!existing) {
			script.src = TURNSTILE_SCRIPT_URL;
			script.async = true;
			script.defer = true;
			script.setAttribute(SCRIPT_ATTR, '');
			document.head.appendChild(script);
		}
	});
	return pending;
}
