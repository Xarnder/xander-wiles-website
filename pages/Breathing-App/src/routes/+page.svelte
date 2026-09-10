<script lang="ts">
	import { onMount } from 'svelte';
	import ThemeSelect from '$lib/components/ThemeSelect.svelte';
	import '$lib/themes.css';
	import BreathingPath from '$lib/components/BreathingPath.svelte';
	import BreathingControls from '$lib/components/BreathingControls.svelte';
	import { BreathingSession, phases } from '$lib/breathing';

	let session = new BreathingSession();
	let running = $state(false),
		started = $state(false),
		target = $state(6);
	let user = $state(0),
		guide = $state(0),
		cycles = $state(0);
	let mode = $state<'line' | 'square'>('line');

	const calibrated = $derived(cycles >= 3);
	const phase = $derived(Math.floor(guide * 4));
	const expansion = $derived(
		phase === 0
			? guide * 4
			: phase === 1
				? 1
				: phase === 2
					? 1 - (guide * 4 - 2)
					: 0
	);

	function sync() {
		user = session.user;
		guide = session.guide;
		cycles = session.cycles;
	}
	function toggle() {
		running = !running;
		started = true;
		session.interrupt();
	}
	function reset() {
		session = new BreathingSession();
		running = false;
		started = false;
		sync();
	}

	onMount(() => {
		let frame = 0,
			last = performance.now();
		const tick = (now: number) => {
			const dt = now - last;
			last = now;
			if (running) {
				session.tick(Math.min(dt, 100), target);
				sync();
			}
			frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
		const visibility = () => {
			if (document.hidden) {
				running = false;
				session.interrupt();
			}
		};
		document.addEventListener('visibilitychange', visibility);
		return () => {
			cancelAnimationFrame(frame);
			document.removeEventListener('visibilitychange', visibility);
		};
	});
</script>

<svelte:head>
	<title>Still — Find your breathing rhythm</title>
	<meta
		name="description"
		content="A quiet, interactive breathing space. Find your natural rhythm, then gently slow down with a guide that adapts to you."
	/>
</svelte:head>

<div class="experience" style:--expansion={expansion} class:running>
	<div class="atmosphere" aria-hidden="true"></div>

	<header>
		<a href="/" rel="external" class="wordmark" title="Back to Xander Wiles Home">
			<span class="mark" aria-hidden="true">✳</span> still<span class="period">.</span>
		</a>
		<ThemeSelect />
	</header>

	<main>
		<div class="guidance" aria-live="polite">
			<h2>{running ? phases[phase] : 'Follow your breath'}</h2>
			{#if running && !calibrated}
				<p class="calibration-note">{cycles} of 3 calibration breaths</p>
			{/if}
		</div>

		<div class="practice">
			<BreathingPath
				{mode}
				{user}
				{guide}
				{running}
				{calibrated}
				{cycles}
				onbegin={() => {
					running = true;
					started = true;
					session.begin();
				}}
				onend={() => session.interrupt()}
				onmove={(p) => {
					session.move(p);
					sync();
				}}
			/>
		</div>

		<div class="session-controls">
			<div class="mode-switch" role="group" aria-label="Breathing path mode">
				{#each ['line', 'square'] as choice (choice)}
					<button
						type="button"
						aria-pressed={mode === choice}
						onclick={() => {
							mode = choice as 'line' | 'square';
							reset();
						}}>{choice === 'line' ? 'Line' : 'Square'}</button
					>
				{/each}
			</div>

			<BreathingControls
				{running}
				{started}
				{target}
				ontoggle={toggle}
				onreset={reset}
				onchange={(v) => (target = v)}
			/>
		</div>
	</main>
</div>

<style>
	:global(*) {
		box-sizing: border-box;
	}
	:global(body) {
		margin: 0;
		background: var(--ink-101918, #101918);
		color: var(--ink-e7e8d9, #e7e8d9);
		font-family: 'Quicksand', 'Nunito', ui-rounded, 'Comfortaa', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
		-webkit-font-smoothing: antialiased;
	}
	:global(button),
	:global(input) {
		font: inherit;
	}
	:global(button) {
		-webkit-tap-highlight-color: transparent;
	}

	.experience {
		min-height: 100svh;
		position: relative;
		isolation: isolate;
		overflow: hidden;
		padding: 0 max(16px, env(safe-area-inset-right))
			max(16px, env(safe-area-inset-bottom))
			max(16px, env(safe-area-inset-left));
		display: flex;
		flex-direction: column;
		background:
			radial-gradient(
				ellipse at 50% 49%,
				var(--ink-33403335, #33403335),
				transparent 58%
			),
			linear-gradient(
				130deg,
				var(--ink-101e1c, #101e1c),
				var(--ink-141a17, #141a17) 60%,
				var(--ink-25271b, #25271b)
			);
	}

	.atmosphere {
		position: absolute;
		z-index: -1;
		inset: 17% 4% 25%;
		border-radius: 50%;
		background: radial-gradient(
			ellipse,
			var(--ink-75926a16, #75926a16),
			transparent 65%
		);
		transform: scale(calc(0.85 + var(--expansion) * 0.2));
		opacity: calc(0.6 + var(--expansion) * 0.3);
		will-change: transform;
		pointer-events: none;
	}

	header {
		height: 60px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		border-bottom: 1px solid var(--ink-b8c4a912, rgba(255, 255, 255, 0.08));
		max-width: 520px;
		width: 100%;
		margin: 0 auto;
		flex-shrink: 0;
	}

	.wordmark {
		font-family: 'Quicksand', 'Nunito', ui-rounded, sans-serif;
		font-weight: 700;
		font-size: 24px;
		text-decoration: none;
		color: var(--ink-e1e4d1, #e1e4d1);
		letter-spacing: -0.5px;
		display: inline-flex;
		align-items: center;
		transition: opacity 0.2s ease;
		cursor: pointer;
	}
	.wordmark:hover {
		opacity: 0.82;
	}
	.mark {
		font-size: 18px;
		vertical-align: 1px;
		margin-right: 7px;
		color: var(--ink-c8d4b3, #c8d4b3);
	}
	.period {
		color: var(--ink-a9c49c, #a9c49c);
	}

	main {
		max-width: 440px;
		width: 100%;
		margin: auto;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 10px 0 16px;
	}

	.guidance {
		text-align: center;
		margin-bottom: 8px;
		min-height: 44px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
	}
	.guidance h2 {
		font-family: 'Quicksand', 'Nunito', ui-rounded, sans-serif;
		font-weight: 600;
		font-size: clamp(22px, 5.5vw, 28px);
		letter-spacing: -0.01em;
		margin: 0;
		color: var(--ink-e7eadd, #e7eadd);
		transition: color 0.3s ease;
	}
	.calibration-note {
		font-family: 'Quicksand', 'Nunito', ui-rounded, sans-serif;
		font-size: 12px;
		font-weight: 500;
		color: var(--ink-a7b29f, #a7b29f);
		margin: 4px 0 0;
		letter-spacing: 0.02em;
	}

	.practice {
		width: 100%;
		display: flex;
		justify-content: center;
		align-items: center;
	}

	.session-controls {
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		margin-top: 10px;
	}

	.mode-switch {
		display: flex;
		justify-content: center;
		gap: 6px;
		margin: 0 auto 12px;
	}
	.mode-switch button {
		border: 1px solid var(--ink-b8c4a925, #b8c4a925);
		border-radius: 100px;
		min-height: 34px;
		padding: 0 16px;
		background: transparent;
		color: var(--ink-9eaf9d, #9eaf9d);
		font-size: 12px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
	}
	.mode-switch button[aria-pressed='true'] {
		background: var(--ink-b8c4a915, #b8c4a915);
		color: var(--ink-e1e8d1, #e1e8d1);
		font-weight: 600;
	}
	:global(:root[data-theme='oled']) .mode-switch button[aria-pressed='true'] {
		background: rgba(255, 255, 255, 0.15);
		color: #ffffff;
	}
	:global(:root[data-theme='light']) .mode-switch button[aria-pressed='true'] {
		background: #253b2c;
		color: #f7f6f0;
	}
	.mode-switch button:focus-visible {
		outline: 2px solid var(--ink-e9c995, #e9c995);
	}

	@media (prefers-reduced-motion: reduce) {
		.atmosphere {
			transform: none;
			opacity: 0.6;
			will-change: auto;
		}
		:global(*) {
			scroll-behavior: auto !important;
			transition: none !important;
		}
	}
</style>
