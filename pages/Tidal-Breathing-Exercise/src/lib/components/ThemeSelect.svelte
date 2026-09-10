<script lang="ts">
	import { onMount } from 'svelte';

	type Theme = 'oled' | 'dark' | 'light';

	const themeMeta: Record<
		Theme,
		{ label: string; next: Theme; nextLabel: string }
	> = {
		oled: { label: 'OLED', next: 'dark', nextLabel: 'Dark' },
		dark: { label: 'Dark', next: 'light', nextLabel: 'Light' },
		light: { label: 'Light', next: 'oled', nextLabel: 'OLED' }
	};

	let theme = $state<Theme>('oled');
	const current = $derived(themeMeta[theme] ?? themeMeta.oled);

	function select(value: Theme) {
		theme = value;
		document.documentElement.dataset.theme = value;

		const themeColor =
			value === 'light' ? '#f6f5ee' : value === 'dark' ? '#101918' : '#000000';
		document
			.querySelector('meta[name="theme-color"]')
			?.setAttribute('content', themeColor);

		try {
			localStorage.setItem('still-theme', value);
		} catch {
			/* Storage fallback */
		}
	}

	function cycle() {
		select(current.next);
	}

	onMount(() => {
		const saved = document.documentElement.dataset.theme as Theme | undefined;
		if (saved === 'light' || saved === 'oled' || saved === 'dark') {
			theme = saved;
			select(saved);
		} else {
			try {
				const stored = localStorage.getItem('still-theme') as Theme | null;
				if (stored === 'light' || stored === 'oled' || stored === 'dark') {
					select(stored);
				} else {
					select('oled');
				}
			} catch {
				select('oled');
			}
		}
	});
</script>

<button
	type="button"
	class="theme-toggle-btn"
	data-theme={theme}
	onclick={cycle}
	aria-label="Current theme: {current.label}. Switch to {current.nextLabel}."
	title="Theme: {current.label} (click to switch to {current.nextLabel})"
>
	<span class="icon-wrap" aria-hidden="true">
		{#if theme === 'oled'}
			<svg
				class="theme-icon"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path
					d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"
					fill="currentColor"
					fill-opacity="0.25"
				/>
			</svg>
		{:else if theme === 'dark'}
			<svg
				class="theme-icon"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
			>
				<circle cx="12" cy="12" r="9" />
				<path d="M12 3a9 9 0 0 1 0 18V3z" fill="currentColor" />
			</svg>
		{:else}
			<svg
				class="theme-icon"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<circle cx="12" cy="12" r="4" fill="currentColor" />
				<path
					d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"
				/>
			</svg>
		{/if}
	</span>
	<span class="theme-label">{current.label}</span>
</button>

<style>
	.theme-toggle-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		min-height: 30px;
		height: 30px;
		padding: 0 11px 0 9px;
		border-radius: 999px;
		border: 1px solid var(--ink-b8c4a925, rgba(184, 196, 169, 0.2));
		background: var(--ink-b8c4a912, rgba(184, 196, 169, 0.08));
		color: var(--ink-e1e8d1, #e1e8d1);
		font-family: 'Quicksand', 'Nunito', ui-rounded, sans-serif;
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.01em;
		cursor: pointer;
		user-select: none;
		-webkit-user-select: none;
		transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
		touch-action: manipulation;
		-webkit-tap-highlight-color: transparent;
	}

	.theme-toggle-btn:hover {
		background: var(--ink-b8c4a925, rgba(184, 196, 169, 0.16));
		border-color: var(--ink-b8c4a940, rgba(184, 196, 169, 0.35));
		transform: translateY(-1px);
	}

	.theme-toggle-btn:active {
		transform: scale(0.95);
	}

	.theme-toggle-btn:focus-visible {
		outline: 2px solid var(--ink-e9c995, #e9c995);
		outline-offset: 2px;
	}

	:global(:root[data-theme='oled']) .theme-toggle-btn {
		border-color: rgba(255, 255, 255, 0.16);
		background: rgba(255, 255, 255, 0.06);
		color: #ffffff;
	}

	:global(:root[data-theme='oled']) .theme-toggle-btn:hover {
		background: rgba(255, 255, 255, 0.14);
		border-color: rgba(255, 255, 255, 0.3);
	}

	:global(:root[data-theme='light']) .theme-toggle-btn {
		border-color: rgba(37, 59, 44, 0.2);
		background: rgba(37, 59, 44, 0.07);
		color: #253b2c;
	}

	:global(:root[data-theme='light']) .theme-toggle-btn:hover {
		background: rgba(37, 59, 44, 0.14);
		border-color: rgba(37, 59, 44, 0.35);
	}

	.icon-wrap {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 14px;
		height: 14px;
		flex-shrink: 0;
	}

	.theme-icon {
		width: 14px;
		height: 14px;
		transition: transform 0.25s ease;
	}

	.theme-toggle-btn:hover .theme-icon {
		transform: rotate(15deg);
	}

	.theme-label {
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}
</style>
