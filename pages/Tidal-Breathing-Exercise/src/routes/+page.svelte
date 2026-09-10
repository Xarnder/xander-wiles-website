<script lang="ts">
	import { onMount } from 'svelte';
	import { cubicInOut } from 'svelte/easing';
	import { fade, type TransitionConfig } from 'svelte/transition';
	import ThemeSelect from '$lib/components/ThemeSelect.svelte';
	import '$lib/themes.css';
	import BreathingPath from '$lib/components/BreathingPath.svelte';
	import BreathingControls from '$lib/components/BreathingControls.svelte';
	import WaterBackground from '$lib/components/WaterBackground.svelte';
	import { BreathingSession, phases } from '$lib/breathing';

	let session = new BreathingSession();
	let running = $state(false),
		started = $state(false),
		target = $state(4);
	let user = $state(0),
		guide = $state(0),
		cycles = $state(0),
		currentRate = $state<number | null>(null),
		guideRate = $state<number | null>(null);
	let mode = $state<'line' | 'square'>('line');
	let atTarget = $state(false);

	const calibrated = $derived(cycles >= 2);
	const phase = $derived(Math.floor(guide * 4));

	$effect(() => {
		if (!running || cycles < 1) {
			atTarget = false;
			return;
		}
		const effectiveRate = currentRate ?? guideRate;
		if (effectiveRate !== null) {
			const diff = Math.abs(effectiveRate - target);
			if (!atTarget && diff <= 0.75) {
				atTarget = true;
			} else if (atTarget && diff > 1.35) {
				atTarget = false;
			}
		} else {
			atTarget = false;
		}
	});
	const expansion = $derived(
		phase === 0
			? guide * 4
			: phase === 1
				? 1
				: phase === 2
					? 1 - (guide * 4 - 2)
					: 0
	);
	const phaseText = $derived(running ? phases[phase] : 'Follow your breath');
	const phaseKey = $derived(running ? `${phase}` : 'idle');

	function cubeIn(_node: Element): TransitionConfig {
		if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			return {
				duration: 200,
				css: (t) => `opacity: ${t};`
			};
		}
		return {
			duration: 560,
			easing: cubicInOut,
			css: (t, u) => {
				const deg = -90 * u;
				const opacity = Math.min(1, t * 2.2);
				return `
					transform: rotateX(${deg}deg);
					opacity: ${opacity};
					filter: brightness(${0.6 + 0.4 * t});
				`;
			}
		};
	}

	function cubeOut(_node: Element): TransitionConfig {
		if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			return {
				duration: 200,
				css: (t) => `opacity: ${t};`
			};
		}
		return {
			duration: 560,
			easing: cubicInOut,
			css: (t, u) => {
				const deg = 90 * u;
				const opacity = Math.min(1, t * 2.2);
				return `
					transform: rotateX(${deg}deg);
					opacity: ${opacity};
					filter: brightness(${0.6 + 0.4 * t});
				`;
			}
		};
	}

	function sync() {
		user = session.user;
		guide = session.guide;
		cycles = Math.max(session.cycles, session.guideCycles);
		currentRate = session.currentRate;
		guideRate = session.guideRate;
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
		atTarget = false;
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
	<title>Tidal Breathing</title>
	<meta
		name="description"
		content="A quiet, interactive breathing space. Find your natural rhythm, then gently slow down with a guide that adapts to you."
	/>
</svelte:head>

<div class="experience" style:--expansion={expansion} class:running>
	<WaterBackground {expansion} {running} />
	<div class="atmosphere" aria-hidden="true"></div>

	<header>
		<a href="/" rel="external" class="wordmark" title="Back to Xander Wiles Home">
			Tidal Breathing
		</a>
		<ThemeSelect />
	</header>

	<main>
		<div class="guidance" aria-live="polite">
			<div class="cube-viewport">
				{#key phaseKey}
					<h2 in:cubeIn out:cubeOut class="cube-face">{phaseText}</h2>
				{/key}
			</div>
			{#if atTarget}
				<div class="target-badge" in:fade={{ duration: 350 }} out:fade={{ duration: 250 }}>
					<span class="target-badge-sparkle" aria-hidden="true">✦</span>
					<span class="target-badge-text">Well done — perfect target speed</span>
					<span class="target-badge-sparkle" aria-hidden="true">✦</span>
				</div>
			{:else if running && !calibrated}
				<p class="calibration-note">{cycles} of 2 calibration breaths</p>
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
				{atTarget}
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
				{currentRate}
				{atTarget}
				ontoggle={toggle}
				onreset={reset}
				onchange={(v) => {
					target = v;
					const rate = currentRate ?? guideRate;
					if (rate !== null && Math.abs(rate - v) > 1.35) {
						atTarget = false;
					}
				}}
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
		min-height: calc(100svh - var(--site-nav-height, 64px));
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
		position: relative;
		z-index: 2;
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
		font-size: clamp(17px, 4.5vw, 22px);
		text-decoration: none;
		color: var(--ink-e1e4d1, #e1e4d1);
		letter-spacing: -0.5px;
		display: inline-flex;
		align-items: center;
		white-space: nowrap;
		transition: opacity 0.2s ease;
		cursor: pointer;
	}
	.wordmark:hover {
		opacity: 0.82;
	}

	main {
		position: relative;
		z-index: 2;
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
		min-height: 62px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: flex-start;
	}
	.cube-viewport {
		position: relative;
		width: 100%;
		height: 42px;
		perspective: 600px;
		perspective-origin: 50% 50%;
		transform-style: preserve-3d;
		display: flex;
		justify-content: center;
		align-items: center;
	}
	.cube-face {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 0;
		white-space: nowrap;
		backface-visibility: hidden;
		-webkit-backface-visibility: hidden;
		transform-style: preserve-3d;
		transform-origin: 50% 50% -21px;
		font-family: 'Quicksand', 'Nunito', ui-rounded, sans-serif;
		font-weight: 600;
		font-size: clamp(22px, 5.5vw, 28px);
		letter-spacing: -0.01em;
		color: var(--ink-e7eadd, #e7eadd);
		transition: color 0.3s ease;
		pointer-events: none;
		user-select: none;
	}
	.calibration-note {
		font-family: 'Quicksand', 'Nunito', ui-rounded, sans-serif;
		font-size: 12px;
		font-weight: 500;
		color: var(--ink-a7b29f, #a7b29f);
		margin: 4px 0 0;
		letter-spacing: 0.02em;
	}

	.target-badge {
		margin-top: 4px;
		display: inline-flex;
		align-items: center;
		gap: 7px;
		padding: 4px 13px 4px 11px;
		border-radius: 999px;
		background: var(--target-badge-bg, rgba(0, 24, 38, 0.88));
		border: 1px solid var(--target-badge-border, rgba(79, 227, 255, 0.55));
		box-shadow: 0 2px 12px var(--target-badge-glow, rgba(56, 200, 255, 0.35)),
			0 0 16px var(--target-badge-glow, rgba(56, 200, 255, 0.25));
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		user-select: none;
		-webkit-user-select: none;
		animation: targetBadgeGlowPulse 4.2s ease-in-out infinite;
	}

	.target-badge-sparkle {
		font-size: 11px;
		color: var(--theme-guide, #4fe3ff);
		animation: sparkleTwinkle 2.5s ease-in-out infinite;
	}

	.target-badge-text {
		font-family: 'Quicksand', 'Nunito', ui-rounded, sans-serif;
		font-size: 11.5px;
		font-weight: 600;
		letter-spacing: 0.01em;
		color: var(--target-badge-text, #e0f7ff);
		white-space: nowrap;
	}

	@keyframes targetBadgeGlowPulse {
		0%, 100% {
			box-shadow: 0 2px 10px var(--target-badge-glow, rgba(56, 200, 255, 0.3)),
				0 0 14px var(--target-badge-glow, rgba(56, 200, 255, 0.2));
		}
		50% {
			box-shadow: 0 2px 16px var(--target-badge-glow, rgba(56, 200, 255, 0.55)),
				0 0 24px var(--target-badge-glow, rgba(56, 200, 255, 0.35));
		}
	}

	@keyframes sparkleTwinkle {
		0%, 100% {
			transform: scale(0.9);
			opacity: 0.7;
		}
		50% {
			transform: scale(1.15);
			opacity: 1;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.target-badge,
		.target-badge-sparkle {
			animation: none !important;
		}
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
		background: rgba(56, 200, 255, 0.18);
		border-color: rgba(56, 200, 255, 0.45);
		color: #38c8ff;
		box-shadow: 0 0 12px rgba(56, 200, 255, 0.2);
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
