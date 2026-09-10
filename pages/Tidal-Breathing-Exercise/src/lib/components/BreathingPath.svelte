<script lang="ts">
	import LineBreathingPath from './LineBreathingPath.svelte';
	import SquareBreathingPath from './SquareBreathingPath.svelte';
	let { mode = 'line', ...props } = $props<{
		mode?: 'line' | 'square';
		user: number;
		guide: number;
		running: boolean;
		calibrated: boolean;
		cycles: number;
		atTarget?: boolean;
		onmove: (p: number) => void;
		onbegin: () => void;
		onend: () => void;
	}>();
</script>

{#if mode === 'line'}<LineBreathingPath {...props} />{:else}<SquareBreathingPath
		{...props}
	/>{/if}
