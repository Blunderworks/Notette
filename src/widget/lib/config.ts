import type { DeploymentInfo } from '$lib/shared/types';

export type WidgetPosition = 'bottom-right' | 'bottom-left';

/** Options accepted by Notette.init() and the script tag data-* attributes. */
export interface NotetteInitOptions {
	/** Project client key (public identifier). */
	key: string;
	/** Base URL of the Notette instance. Defaults to the origin the script was loaded from. */
	host?: string;
	deployment?: DeploymentInfo;
	metadata?: Record<string, unknown>;
	/** Pre-filled reviewer identity (name/email) when the host app knows the user. */
	user?: { name?: string; email?: string };
	position?: WidgetPosition;
	/** Start with the toolbar expanded. */
	open?: boolean;
}

export interface ResolvedConfig {
	key: string;
	host: string;
	deployment: DeploymentInfo | undefined;
	metadata: Record<string, unknown> | undefined;
	user: { name?: string; email?: string } | undefined;
	position: WidgetPosition;
	open: boolean;
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
		position: options?.position ?? script.position ?? 'bottom-right',
		open: options?.open ?? script.open ?? false
	};
}
