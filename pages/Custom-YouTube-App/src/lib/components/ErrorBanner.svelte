<script lang="ts">
	let { message }: { message: string } = $props();
</script>

<p class="rounded-xl border border-line bg-raised px-4 py-3 text-sm text-danger" role="alert">
	{message}
</p>
