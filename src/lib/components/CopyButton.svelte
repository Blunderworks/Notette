<script lang="ts">
	interface Props {
		text: string | (() => string);
		label?: string;
		copiedLabel?: string;
		class?: string;
	}

	let { text, label = 'Copy', copiedLabel = 'Copied', class: className = 'btn btn-sm' }: Props = $props();
	let copied = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	async function copy() {
		const value = typeof text === 'function' ? text() : text;
		let ok = false;
		try {
			await navigator.clipboard.writeText(value);
			ok = true;
		} catch {
			const area = document.createElement('textarea');
			area.value = value;
			area.setAttribute('readonly', '');
			area.style.position = 'fixed';
			area.style.opacity = '0';
			document.body.appendChild(area);
			area.select();
			try {
				ok = document.execCommand('copy');
			} catch {
				ok = false;
			}
			area.remove();
		}
		if (ok) {
			copied = true;
			clearTimeout(timer);
			timer = setTimeout(() => (copied = false), 1800);
		}
	}
</script>

<button type="button" class={className} onclick={copy} aria-live="polite">
	{copied ? copiedLabel : label}
</button>
