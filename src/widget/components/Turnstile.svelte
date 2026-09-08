<script lang="ts">
	import { onMount } from 'svelte';
	import { loadTurnstile, type TurnstileApi } from '$lib/shared/turnstile-client';

	interface Props {
		siteKey: string;
		/** Reported to Cloudflare analytics (letters, digits, - and _ only). */
		action?: string;
		/** Current response token; null until the challenge completes or after it expires. */
		token?: string | null;
		/** True when the challenge could not be loaded or errored. */
		failed?: boolean;
	}

	let { siteKey, action, token = $bindable(null), failed = $bindable(false) }: Props = $props();

	let container = $state<HTMLDivElement | null>(null);
	/** Cloudflare error code from the last failure, e.g. 110200 (hostname not allowed for the site key). */
	let errorCode = $state<string | null>(null);
	/** Cloudflare reports a hostname missing from the site key's allow-list as 1102xx. */
	const hostnameNotAllowed = $derived(!!errorCode && errorCode.startsWith('1102'));
	let api: TurnstileApi | null = null;
	let widgetId: string | null = null;

	/** Tokens are single-use: call after every submission attempt to obtain a fresh one. */
	export function reset(): void {
		token = null;
		if (api && widgetId) {
			try {
				api.reset(widgetId);
			} catch {
				/* widget already removed */
			}
		}
	}

	onMount(() => {
		let cancelled = false;
		loadTurnstile()
			.then((t) => {
				if (cancelled || !container) return;
				api = t;
				// Explicit rendering with an element reference works inside the shadow root;
				// "interaction-only" keeps the box invisible unless a challenge needs input.
				widgetId = t.render(container, {
					sitekey: siteKey,
					action,
					appearance: 'interaction-only',
					size: 'flexible',
					callback: (value) => {
						token = value;
						failed = false;
						errorCode = null;
					},
					'expired-callback': () => (token = null),
					'timeout-callback': () => (token = null),
					'error-callback': (code) => {
						console.warn('[notette] Turnstile error', code ?? 'unknown');
						errorCode = code ?? null;
						token = null;
						failed = true;
						return true;
					}
				});
			})
			.catch((err) => {
				console.warn('[notette] Turnstile script failed to load', err);
				failed = true;
			});
		return () => {
			cancelled = true;
			if (api && widgetId) {
				try {
					api.remove(widgetId);
				} catch {
					/* ignore */
				}
			}
		};
	});
</script>

<div class="turnstile" bind:this={container}></div>
{#if failed}
	<div class="nt-error">
		{#if hostnameNotAllowed}
			This site (<span class="nt-mono">{location.hostname}</span>) is not allowed for the Turnstile key. A Notette admin
			must add it under Cloudflare → Turnstile → the widget's hostnames (error {errorCode}).
		{:else}
			The verification challenge could not load{#if errorCode} (Turnstile error {errorCode}){/if}. The site must allow
			<span class="nt-mono">challenges.cloudflare.com</span>.
		{/if}
	</div>
{/if}

<style>
	.turnstile {
		line-height: 0;
	}
	.turnstile:empty {
		display: none;
	}
</style>
