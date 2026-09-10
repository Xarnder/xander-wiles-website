<script lang="ts">
	import { onMount } from 'svelte';

	type Theme = 'dark' | 'oled' | 'light';

	const options: { id: Theme; label: string; icon: string }[] = [
		{ id: 'dark', label: 'Dark', icon: '◐' },
		{ id: 'oled', label: 'OLED', icon: '◼' },
		{ id: 'light', label: 'Light', icon: '☼' }
	];

	let theme = $state<Theme>('dark');

	function select(value: Theme) {
		theme = value;
		document.documentElement.dataset.theme = value;

		const themeColor =
			value === 'light' ? '#f6f5ee' : value === 'oled' ? '#000000' : '#101918';
		document
			.querySelector('meta[name="theme-color"]')
			?.setAttribute('content', themeColor);

		try {
			localStorage.setItem('still-theme', value);
		} catch {
			/* Storage fallback */
		}
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
				}
			} catch {
				/* Storage fallback */
			}
		}
	});
</script>

<div class="theme-switcher" role="group" aria-label="Color theme">
	<div class="pill-group">
		{#each options as opt (opt.id)}
			<button
				type="button"
				class="pill-btn"
				class:active={theme === opt.id}
				aria-pressed={theme === opt.id}
				onclick={() => select(opt.id)}
			>
				<span class="pill-icon" aria-hidden="true">{opt.icon}</span>
				<span class="pill-text">{opt.label}</span>
			</button>
		{/each}
	</div>
</div>

<style>
	.theme-switcher {
		display: flex;
		align-items: center;
		user-select: none;
	}

	.pill-group {
		display: inline-flex;
		align-items: center;
		background: var(--ink-b8c4a912, rgba(184, 196, 169, 0.07));
		border: 1px solid var(--ink-b8c4a925, rgba(184, 196, 169, 0.15));
		border-radius: 100px;
		padding: 2px;
		gap: 2px;
	}

	.pill-btn {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		border: 0;
		border-radius: 100px;
		padding: 4px 10px;
		background: transparent;
		color: var(--ink-a0ad9f, #a0ad9f);
		font-size: 12px;
		cursor: pointer;
		transition: all 0.18s ease;
		min-height: 28px;
	}

	.pill-btn:hover {
		color: var(--ink-e1e8d1, #e1e8d1);
	}

	.pill-btn.active {
		background: var(--ink-d9dfca, #34553d);
		color: var(--ink-101918, #101918);
		font-weight: 600;
		box-shadow: 0 1px 6px rgba(0, 0, 0, 0.15);
	}

	:global(:root[data-theme='oled']) .pill-btn.active {
		background: #ffffff;
		color: #000000;
		box-shadow: 0 0 12px rgba(255, 255, 255, 0.25);
	}

	:global(:root[data-theme='light']) .pill-btn.active {
		background: #253b2c;
		color: #f7f6f0;
		box-shadow: 0 1px 4px rgba(37, 59, 44, 0.15);
	}

	.pill-icon {
		font-size: 9px;
		line-height: 1;
		opacity: 0.85;
	}

	.pill-btn:focus-visible {
		outline: 2px solid var(--ink-e9c995, #e9c995);
		outline-offset: 2px;
	}
</style>
