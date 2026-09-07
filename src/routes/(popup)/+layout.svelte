<script lang="ts">
	let { children } = $props();
</script>

<div class="auth-page">
	<div class="card auth-card">
		<div class="card-body stack">
			{@render children()}
		</div>
	</div>
</div>
