<script lang="ts">
	import { getContext } from 'svelte';
	import type { WidgetController } from './lib/controller.svelte';
	import AuthDialog from './components/AuthDialog.svelte';
	import Composer from './components/Composer.svelte';
	import Launcher from './components/Launcher.svelte';
	import Panel from './components/Panel.svelte';
	import Picker from './components/Picker.svelte';
	import Pins from './components/Pins.svelte';
	import Thread from './components/Thread.svelte';
	import Toast from './components/Toast.svelte';

	// The controller is provided through mount({ context }) in index.ts.
	const controller = getContext<WidgetController>('notette');
	const ui = controller.ui;
</script>

{#if ui.ready && !ui.fatalError}
	<div class="nt-root" data-position={controller.config.position}>
		{#if ui.expanded && ui.picking}
			<Picker />
		{/if}
		{#if ui.expanded && ui.pinsVisible && controller.canSeeFeedback}
			<Pins />
		{/if}
		{#if ui.composer}
			<Composer />
		{/if}
		{#if ui.selectedId}
			<Thread />
		{/if}
		{#if ui.panelOpen}
			<Panel />
		{/if}
		{#if ui.auth.status !== 'idle'}
			<AuthDialog />
		{/if}
		<Launcher />
		<Toast />
	</div>
{/if}
