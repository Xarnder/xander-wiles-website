<script lang="ts">
	import { FEATURED_REGIONS } from '$lib/youtube/featured';

	let {
		value = $bindable(),
		onChange
	}: {
		value: string;
		onChange: (code: string) => void;
	} = $props();
</script>

<label class="flex min-h-11 items-center gap-2 text-sm text-ink">
	<span class="text-muted">Region</span>
	<select
		class="min-h-11 min-w-40 touch-manipulation rounded-xl border border-line bg-raised px-3 text-ink"
		bind:value
		onchange={() => onChange(value)}
	>
		{#each FEATURED_REGIONS as region (region.code)}
			<option value={region.code}>{region.label}</option>
		{/each}
	</select>
</label>
