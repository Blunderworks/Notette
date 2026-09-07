/**
 * Notette widget entry point. Compiled into a standalone IIFE bundle served at
 * /notette.js. It has no dependency on SvelteKit or the host page's framework
 * and renders entirely inside a Shadow DOM attached to a single host element.
 */
import { mount, unmount } from 'svelte';
import './widget.css';
import App from './App.svelte';
import { parseScriptConfig, resolveConfig, type NotetteInitOptions } from './lib/config';
import { WidgetController } from './lib/controller.svelte';

// Replaced at build time with the compiled component + base CSS (see vite.widget.config.ts).
const WIDGET_CSS = '__NOTETTE_CSS__';
const VERSION = '0.1.0';
const HOST_TAG = 'notette-widget';

interface Instance {
	controller: WidgetController;
	app: ReturnType<typeof mount>;
	host: HTMLElement;
}

let instance: Instance | null = null;

const scriptConfig = parseScriptConfig(document.currentScript as HTMLScriptElement | null);

function whenBodyReady(fn: () => void): void {
	if (document.body) fn();
	else document.addEventListener('DOMContentLoaded', fn, { once: true });
}

function init(options?: NotetteInitOptions): void {
	const config = resolveConfig(options, scriptConfig);
	if (!config) return;
	whenBodyReady(() => {
		if (instance) destroy();
		const host = document.createElement(HOST_TAG);
		host.setAttribute(
			'style',
			'all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; overflow: visible; z-index: 2147483000; display: block;'
		);
		host.setAttribute('data-notette', VERSION);
		const shadow = host.attachShadow({ mode: 'open' });
		const style = document.createElement('style');
		style.textContent = WIDGET_CSS;
		shadow.appendChild(style);
		document.body.appendChild(host);

		const controller = new WidgetController(config, host);
		const app = mount(App, { target: shadow, context: new Map([['notette', controller]]) });
		instance = { controller, app, host };
		void controller.start();
	});
}

function destroy(): void {
	if (!instance) return;
	const { controller, app, host } = instance;
	instance = null;
	controller.destroy();
	void unmount(app);
	host.remove();
}

const api = {
	version: VERSION,
	init,
	destroy,
	/** Expands the toolbar. */
	open(): void {
		instance?.controller.expand();
	},
	/** Collapses the toolbar and closes any open panels. */
	close(): void {
		instance?.controller.collapse();
	},
	/** Enters element-picking mode. */
	comment(): void {
		instance?.controller.startPicking();
	},
	/** Opens the feedback list panel. */
	list(): void {
		if (!instance) return;
		instance.controller.expand();
		if (!instance.controller.ui.panelOpen) instance.controller.togglePanel();
	},
	/** Navigates to and highlights a feedback item by id. */
	focus(id: string): void {
		void instance?.controller.focusItem(id);
	}
};

declare global {
	interface Window {
		Notette?: typeof api;
	}
}

window.Notette = api;

if (scriptConfig.autoInit && scriptConfig.key) {
	init();
}

window.dispatchEvent(new CustomEvent('notette:ready', { detail: api }));

export default api;
