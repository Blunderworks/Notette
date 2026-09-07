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
					},
					'expired-callback': () => (token = null),
					'timeout-callback': () => (token = null),
					'error-callback': () => {
						token = null;
						failed = true;
						return true;
					}
				});
			})
			.catch(() => (failed = true));
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
		The verification challenge could not load. The site must allow <span class="nt-mono">challenges.cloudflare.com</span>.
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
