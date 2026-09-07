<script lang="ts">
	import type { FeedbackStatus } from '$lib/shared/types';

	let { status }: { status: FeedbackStatus } = $props();
</script>

<span class="badge {status}">{status === 'open' ? 'Open' : 'Resolved'}</span>
