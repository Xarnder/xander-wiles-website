<script lang="ts">
	import { getNextTheme, getTheme, toggleTheme, type Theme } from '$lib/stores/theme.svelte';

	const theme = $derived(getTheme());
	const next = $derived(getNextTheme(theme));

	const labels: Record<Theme, { icon: string; text: string; action: string }> = {
		dark: { icon: '◑', text: 'Dark', action: 'Switch to OLED black mode' },
		oled: { icon: '●', text: 'OLED', action: 'Switch to light mode' },
		light: { icon: '☀', text: 'Light', action: 'Switch to dark mode' }
	};

	const current = $derived(labels[theme]);
	const upcoming = $derived(labels[next]);
</script>

<button
	type="button"
	class="theme-toggle"
	onclick={toggleTheme}
	aria-label={`${current.action}. Current theme: ${current.text}.`}
	title={`${current.action} (now ${current.text})`}
	data-testid="theme-toggle"
>
	<span aria-hidden="true">{upcoming.icon}</span>
	<span class="text">{upcoming.text}</span>
</button>

<style>
	.theme-toggle {
		appearance: none;
		border: 1px solid var(--line);
		background: var(--surface);
		color: var(--ink);
		border-radius: 999px;
		min-height: 2.5rem;
		padding: 0 0.9rem;
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-weight: 600;
		cursor: pointer;
		touch-action: manipulation;
		box-shadow: var(--shadow-soft);
	}

	.theme-toggle:active {
		transform: scale(0.98);
	}

	.text {
		font-size: 0.9rem;
		color: var(--ink-soft);
	}
</style>
