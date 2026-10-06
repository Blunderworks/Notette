import type { DeploymentInfo } from '$lib/shared/types';

export type WidgetPosition = 'bottom-right' | 'bottom-left';

/**
 * Identity token signed by the host app's server for its signed-in user, or a
 * function returning a fresh one. Null (or a function resolving to null) means
 * no app user is signed in.
 */
export type UserTokenSource = string | null | (() => string | null | undefined | Promise<string | null | undefined>);

/** Options accepted by Notette.init() and the script tag data-* attributes. */
export interface NotetteInitOptions {
	/** Project client key (public identifier). */
	key: string;
	/** Base URL of the Notette instance. Defaults to the origin the script was loaded from. */
	host?: string;
	deployment?: DeploymentInfo;
	metadata?: Record<string, unknown>;
	/** Pre-filled reviewer identity (name/email) when the host app knows the user. Not verified. */
	user?: { name?: string; email?: string };
	/**
	 * Verified identity: a token from your server, or a function the widget calls
	 * whenever it needs a fresh one. Passing the option at all (even null) hands
	 * sign-in to your app: Notette account sign-in is no longer offered.
	 */
	userToken?: UserTokenSource;
	position?: WidgetPosition;
	/** Start with the toolbar expanded. */
	open?: boolean;
	/** Show the floating feedback button (default true). Without it, use Notette.feedback() or Notette.open(). */
	launcher?: boolean;
	/**
	 * Opens another page of your app when a reviewer selects feedback left there,
	 * e.g. with your SPA router. Defaults to a full page load (`location.assign`).
	 */
	navigate?: NavigateHandler;
}

/** Receives the same-origin URL of the page to open; the widget opens the thread once the path changes. */
export type NavigateHandler = (url: string) => unknown;

export interface ResolvedConfig {
	key: string;
	host: string;
	deployment: DeploymentInfo | undefined;
	metadata: Record<string, unknown> | undefined;
	user: { name?: string; email?: string } | undefined;
	userToken: UserTokenSource;
	/** The page passed `userToken` (even null): the host app owns sign-in. */
	identityManaged: boolean;
	position: WidgetPosition;
	open: boolean;
	launcher: boolean;
	navigate: NavigateHandler | null;
}

export interface ScriptConfig extends Partial<NotetteInitOptions> {
	autoInit: boolean;
	scriptOrigin: string | null;
}

function cleanDeployment(input: unknown): DeploymentInfo | undefined {
	if (!input || typeof input !== 'object') return undefined;
	const out: DeploymentInfo = {};
	for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
		if (typeof v === 'string' && v.trim()) out[k] = v.trim().slice(0, 500);
	}
	return Object.keys(out).length ? out : undefined;
}

/** Reads configuration from the <script> tag that loaded the widget. */
export function parseScriptConfig(script: HTMLScriptElement | null): ScriptConfig {
	const d = script?.dataset ?? {};
	let scriptOrigin: string | null = null;
	if (script?.src) {
		try {
			scriptOrigin = new URL(script.src, location.href).origin;
		} catch {
			scriptOrigin = null;
		}
	}
	const deployment = cleanDeployment({
		environment: d.environment,
		branch: d.branch,
		commit: d.commit,
		url: d.deploymentUrl
	});
	return {
		key: d.key,
		host: d.host,
		deployment,
		position: d.position === 'bottom-left' ? 'bottom-left' : d.position === 'bottom-right' ? 'bottom-right' : undefined,
		open: d.open === 'true',
		launcher: d.launcher === 'false' ? false : undefined,
		autoInit: d.autoInit !== 'false',
		scriptOrigin
	};
}

export function resolveConfig(
	options: NotetteInitOptions | undefined,
	script: ScriptConfig
): ResolvedConfig | null {
	const key = (options?.key ?? script.key ?? '').trim();
	if (!key) {
		console.error('[notette] Missing project key. Add data-key="…" to the script tag or pass { key } to Notette.init().');
		return null;
	}
	const hostRaw = options?.host ?? script.host ?? script.scriptOrigin;
	if (!hostRaw) {
		console.error('[notette] Could not determine the Notette host. Pass { host } to Notette.init().');
		return null;
	}
	let host: string;
	try {
		const url = new URL(hostRaw, location.href);
		host = url.origin + url.pathname.replace(/\/+$/, '');
	} catch {
		console.error('[notette] Invalid host URL', hostRaw);
		return null;
	}
	return {
		key,
		host,
		deployment: cleanDeployment(options?.deployment) ?? script.deployment,
		metadata: options?.metadata && typeof options.metadata === 'object' ? options.metadata : undefined,
		user: options?.user,
		userToken: typeof options?.userToken === 'string' || typeof options?.userToken === 'function' ? options.userToken : null,
		identityManaged: !!options && 'userToken' in options,
		position: options?.position ?? script.position ?? 'bottom-right',
		open: options?.open ?? script.open ?? false,
		launcher: options?.launcher ?? script.launcher ?? true,
		navigate: typeof options?.navigate === 'function' ? options.navigate : null
	};
}
