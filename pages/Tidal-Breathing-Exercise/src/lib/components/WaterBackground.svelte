<script lang="ts">
	let { expansion = 0, running = false } = $props<{
		expansion?: number;
		running?: boolean;
	}>();

	let innerWidth = $state(1200);

	// Quintic smootherstep easing curve:
	// S(t) = 6t^5 - 15t^4 + 10t^3
	// Both first and second derivatives are zero at ends (t=0 and t=1),
	// giving a silky, organic ease-in and ease-out as water arrives at top and bottom.
	function smoothEase(t: number): number {
		const c = Math.max(0, Math.min(1, t));
		return c * c * c * (c * (c * 6 - 15) + 10);
	}

	let eased = $derived(smoothEase(expansion));

	// Calculate water level height percentage based on eased breath expansion:
	// - Idle / not running: gentle resting level at 26%
	// - Running: smoothly eases from 18% (exhale/empty) to 70% (inhale/full)
	let level = $derived(running ? 18 + eased * 52 : 26);
	let surfaceOpacity = $derived(running ? 0.55 + eased * 0.45 : 0.5);

	// Fixed physical wavelengths in pixels:
	// Front wave has 320px wavelength, back wave has 260px wavelength.
	// As screens get wider, more waves are rendered across the width instead of wider waves.
	const W_FRONT = 320;
	const W_BACK = 260;

	let frontCount = $derived(
		Math.max(4, Math.ceil((innerWidth || 1200) / W_FRONT) + 3)
	);
	let backCount = $derived(
		Math.max(5, Math.ceil((innerWidth || 1200) / W_BACK) + 3)
	);

	let frontWidth = $derived(frontCount * W_FRONT);
	let backWidth = $derived(backCount * W_BACK);

	// Front wave: center at y=24, crest at y=10, trough at y=38
	let frontPathData = $derived.by(() => {
		let d = `M 0 24`;
		for (let i = 0; i < frontCount; i++) {
			const x = i * W_FRONT;
			d += ` C ${x + 54} 10, ${x + 106} 10, ${x + 160} 24 C ${x + 214} 38, ${x + 266} 38, ${x + 320} 24`;
		}
		return d;
	});

	// The front wave path fill extends all the way down into the depths,
	// so the gradient flows directly from the wave surface with NO straight line
	let frontFillData = $derived(`${frontPathData} V 2500 H 0 Z`);

	// Back wave: center at y=20, crest at y=8, trough at y=32
	let backPathData = $derived.by(() => {
		let d = `M 0 20`;
		for (let i = 0; i < backCount; i++) {
			const x = i * W_BACK;
			d += ` C ${x + 44} 8, ${x + 86} 8, ${x + 130} 20 C ${x + 174} 32, ${x + 216} 32, ${x + 260} 20`;
		}
		return d;
	});

	let backFillData = $derived(`${backPathData} V 2500 H 0 Z`);

	// Pixel-relative fish swimming speeds (pixels per second):
	// Speed is constant across all viewports (approx 1 body-length per second),
	// preventing fish from racing across wide screens or crawling to a halt on slim mobile screens.
	const V_FISH_1 = 26; // px/s (~28px length)
	const V_FISH_2 = 20; // px/s (~22px length, deep slow swimmer)
	const V_FISH_3 = 28; // px/s (~18px length, agile upper fish)
	const V_FISH_4 = 22; // px/s (~25px length, tranquil bottom dweller)

	let w = $derived(Math.max(300, innerWidth || 1200));

	// Calculate total cycle durations (seconds) so velocity remains constant:
	// Distance = width * span. One-way swim phase is 42% of total cycle.
	// Total cycle T = (width * span) / (0.42 * velocity)
	let durFish1 = $derived(Math.round(((w * 0.78) / (0.42 * V_FISH_1)) * 10) / 10);
	let durFish2 = $derived(Math.round(((w * 0.76) / (0.42 * V_FISH_2)) * 10) / 10);
	let durFish3 = $derived(Math.round(((w * 0.66) / (0.42 * V_FISH_3)) * 10) / 10);
	let durFish4 = $derived(Math.round(((w * 0.62) / (0.42 * V_FISH_4)) * 10) / 10);

	// Stagger initial phases across the screen
	let delayFish1 = 0;
	let delayFish2 = $derived(Math.round(-0.39 * durFish2 * 10) / 10);
	let delayFish3 = $derived(Math.round(-0.25 * durFish3 * 10) / 10);
	let delayFish4 = $derived(Math.round(-0.62 * durFish4 * 10) / 10);
</script>

<svelte:window bind:innerWidth />

<div
	class="water-viewport"
	class:running
	aria-hidden="true"
	style:--water-height="{level}%"
	style:--surface-opacity={surfaceOpacity}
>
	<!-- Water body container rising from bottom -->
	<div class="water-stage">
		<!-- Back Wave (softer, slower parallax drift, fixed 260px wavelength) -->
		<div class="wave-layer wave-back">
			<svg
				width="{backWidth}px"
				height="100%"
				class="wave-svg"
			>
				<defs>
					<linearGradient
						id="backWaterGrad"
						x1="0"
						y1="8"
						x2="0"
						y2="340"
						gradientUnits="userSpaceOnUse"
					>
						<stop offset="0%" stop-color="var(--water-top, rgba(35, 115, 185, 0.22))" />
						<stop offset="100%" stop-color="var(--water-bottom, rgba(8, 24, 46, 0.6))" />
					</linearGradient>
				</defs>
				<path
					d={backFillData}
					fill="url(#backWaterGrad)"
				/>
			</svg>
		</div>

		<!-- Front Wave (organic wave motion with luminous crest, fixed 320px wavelength) -->
		<!-- The fill extends down continuously with zero straight seams -->
		<div class="wave-layer wave-front">
			<svg
				width="{frontWidth}px"
				height="100%"
				class="wave-svg"
			>
				<defs>
					<linearGradient
						id="frontWaterGrad"
						x1="0"
						y1="10"
						x2="0"
						y2="380"
						gradientUnits="userSpaceOnUse"
					>
						<stop offset="0%" stop-color="var(--water-top, rgba(35, 115, 185, 0.32))" />
						<stop offset="70%" stop-color="var(--water-bottom, rgba(8, 24, 46, 0.85))" />
						<stop offset="100%" stop-color="var(--water-bottom, rgba(8, 24, 46, 0.95))" />
					</linearGradient>
				</defs>
				<!-- Front wave body fill: flows directly from the wave surface into the deep -->
				<path
					d={frontFillData}
					fill="url(#frontWaterGrad)"
				/>
				<!-- Subtle surface highlight stroke -->
				<path
					d={frontPathData}
					fill="none"
					stroke="var(--water-surface, rgba(135, 210, 255, 0.6))"
					stroke-width="2"
					class="crest-highlight"
				/>
			</svg>
		</div>

		<!-- Fish swimming habitat inside the water mass (transparent, no straight borders) -->
		<div
			class="fish-school"
			style:--dur-fish-1="{durFish1}s"
			style:--delay-fish-1="{delayFish1}s"
			style:--dur-fish-2="{durFish2}s"
			style:--delay-fish-2="{delayFish2}s"
			style:--dur-fish-3="{durFish3}s"
			style:--delay-fish-3="{delayFish3}s"
			style:--dur-fish-4="{durFish4}s"
			style:--delay-fish-4="{delayFish4}s"
		>
			<div class="fish-container fish-1" aria-hidden="true">
				<svg viewBox="0 0 36 22" class="fish-svg">
					<path
						d="M 34 11 C 28 5, 18 4, 10 9 L 2 4 C 4 8.5, 4 13.5, 2 18 L 10 13 C 18 18, 28 17, 34 11 Z"
						fill="var(--fish-silhouette, rgba(145, 215, 255, 0.4))"
					/>
				</svg>
			</div>
			<div class="fish-container fish-2" aria-hidden="true">
				<svg viewBox="0 0 36 22" class="fish-svg">
					<path
						d="M 34 11 C 28 5, 18 4, 10 9 L 2 4 C 4 8.5, 4 13.5, 2 18 L 10 13 C 18 18, 28 17, 34 11 Z"
						fill="var(--fish-silhouette, rgba(145, 215, 255, 0.4))"
					/>
				</svg>
			</div>
			<div class="fish-container fish-3" aria-hidden="true">
				<svg viewBox="0 0 36 22" class="fish-svg">
					<path
						d="M 34 11 C 28 5, 18 4, 10 9 L 2 4 C 4 8.5, 4 13.5, 2 18 L 10 13 C 18 18, 28 17, 34 11 Z"
						fill="var(--fish-silhouette, rgba(145, 215, 255, 0.4))"
					/>
				</svg>
			</div>
			<div class="fish-container fish-4" aria-hidden="true">
				<svg viewBox="0 0 36 22" class="fish-svg">
					<path
						d="M 34 11 C 28 5, 18 4, 10 9 L 2 4 C 4 8.5, 4 13.5, 2 18 L 10 13 C 18 18, 28 17, 34 11 Z"
						fill="var(--fish-silhouette, rgba(145, 215, 255, 0.4))"
					/>
				</svg>
			</div>
		</div>
	</div>
</div>

<style>
	.water-viewport {
		position: absolute;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
		z-index: 0;
	}

	.water-stage {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: calc(var(--water-height, 26%) + 24px);
		will-change: height;
		overflow: hidden;
	}

	.water-viewport:not(.running) .water-stage {
		transition: height 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
	}

	.wave-layer {
		position: absolute;
		top: 0;
		left: 0;
		height: 100%;
		pointer-events: none;
	}

	.wave-svg {
		display: block;
		height: 100%;
	}

	.wave-back {
		opacity: 0.45;
		animation: drift-back 14s linear infinite;
		will-change: transform;
	}

	.wave-front {
		opacity: 0.92;
		animation: drift-front 9s linear infinite;
		will-change: transform;
	}

	.crest-highlight {
		opacity: var(--surface-opacity, 0.65);
		transition: opacity 0.3s ease;
	}

	/* Fish habitat */
	.fish-school {
		position: absolute;
		inset: 0;
		pointer-events: none;
		overflow: hidden;
	}

	/* Silhouette Fish Styling */
	.fish-container {
		position: absolute;
		pointer-events: none;
		will-change: transform, left;
		filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.2));
	}

	.fish-svg {
		display: block;
		width: 100%;
		height: 100%;
	}

	.fish-1 {
		top: 28%;
		width: 28px;
		height: 17px;
		animation: swim-fish-1 var(--dur-fish-1, 56s) cubic-bezier(0.37, 0, 0.63, 1) infinite var(--delay-fish-1, 0s);
	}

	.fish-2 {
		top: 62%;
		width: 22px;
		height: 13px;
		opacity: 0.7;
		animation: swim-fish-2 var(--dur-fish-2, 72s) cubic-bezier(0.37, 0, 0.63, 1) infinite var(--delay-fish-2, -28s);
	}

	.fish-3 {
		top: 16%;
		width: 18px;
		height: 11px;
		opacity: 0.8;
		animation: swim-fish-3 var(--dur-fish-3, 48s) cubic-bezier(0.37, 0, 0.63, 1) infinite var(--delay-fish-3, -12s);
	}

	.fish-4 {
		top: 76%;
		width: 25px;
		height: 15px;
		opacity: 0.55;
		animation: swim-fish-4 var(--dur-fish-4, 64s) cubic-bezier(0.37, 0, 0.63, 1) infinite var(--delay-fish-4, -40s);
	}

	@keyframes swim-fish-1 {
		0% {
			left: 6%;
			transform: scaleX(1) translateY(0px) rotate(1deg);
		}
		22% {
			transform: scaleX(1) translateY(-5px) rotate(-1deg);
		}
		42% {
			left: 84%;
			transform: scaleX(1) translateY(3px) rotate(1deg);
		}
		46% {
			left: 86%;
			transform: scaleX(0.12) translateY(0px) rotate(3deg);
		}
		50% {
			left: 84%;
			transform: scaleX(-1) translateY(-2px) rotate(-1deg);
		}
		72% {
			transform: scaleX(-1) translateY(4px) rotate(1deg);
		}
		92% {
			left: 8%;
			transform: scaleX(-1) translateY(-3px) rotate(-1deg);
		}
		96% {
			left: 6%;
			transform: scaleX(-0.12) translateY(0px) rotate(-3deg);
		}
		100% {
			left: 6%;
			transform: scaleX(1) translateY(0px) rotate(1deg);
		}
	}

	@keyframes swim-fish-2 {
		0% {
			left: 86%;
			transform: scaleX(-1) translateY(0px) rotate(-1deg);
		}
		24% {
			transform: scaleX(-1) translateY(4px) rotate(1deg);
		}
		42% {
			left: 10%;
			transform: scaleX(-1) translateY(-3px) rotate(0deg);
		}
		46% {
			left: 8%;
			transform: scaleX(-0.12) translateY(0px) rotate(-3deg);
		}
		50% {
			left: 10%;
			transform: scaleX(1) translateY(2px) rotate(1deg);
		}
		74% {
			transform: scaleX(1) translateY(-4px) rotate(-1deg);
		}
		92% {
			left: 84%;
			transform: scaleX(1) translateY(3px) rotate(1deg);
		}
		96% {
			left: 86%;
			transform: scaleX(0.12) translateY(0px) rotate(3deg);
		}
		100% {
			left: 86%;
			transform: scaleX(-1) translateY(0px) rotate(-1deg);
		}
	}

	@keyframes swim-fish-3 {
		0% {
			left: 12%;
			transform: scaleX(1) translateY(0px) rotate(2deg);
		}
		20% {
			transform: scaleX(1) translateY(-3px) rotate(-1deg);
		}
		42% {
			left: 78%;
			transform: scaleX(1) translateY(2px) rotate(1deg);
		}
		46% {
			left: 80%;
			transform: scaleX(0.1) translateY(0px) rotate(4deg);
		}
		50% {
			left: 78%;
			transform: scaleX(-1) translateY(-2px) rotate(-2deg);
		}
		70% {
			transform: scaleX(-1) translateY(3px) rotate(1deg);
		}
		92% {
			left: 14%;
			transform: scaleX(-1) translateY(-2px) rotate(0deg);
		}
		96% {
			left: 12%;
			transform: scaleX(-0.1) translateY(0px) rotate(-4deg);
		}
		100% {
			left: 12%;
			transform: scaleX(1) translateY(0px) rotate(2deg);
		}
	}

	@keyframes swim-fish-4 {
		0% {
			left: 76%;
			transform: scaleX(-1) translateY(0px) rotate(-1deg);
		}
		22% {
			transform: scaleX(-1) translateY(3px) rotate(1deg);
		}
		42% {
			left: 14%;
			transform: scaleX(-1) translateY(-2px) rotate(0deg);
		}
		46% {
			left: 12%;
			transform: scaleX(-0.12) translateY(0px) rotate(-3deg);
		}
		50% {
			left: 14%;
			transform: scaleX(1) translateY(3px) rotate(1deg);
		}
		72% {
			transform: scaleX(1) translateY(-3px) rotate(-1deg);
		}
		92% {
			left: 74%;
			transform: scaleX(1) translateY(2px) rotate(1deg);
		}
		96% {
			left: 76%;
			transform: scaleX(0.12) translateY(0px) rotate(3deg);
		}
		100% {
			left: 76%;
			transform: scaleX(-1) translateY(0px) rotate(-1deg);
		}
	}

	@keyframes drift-front {
		0% {
			transform: translate3d(0, 0, 0);
		}
		100% {
			transform: translate3d(-320px, 0, 0);
		}
	}

	@keyframes drift-back {
		0% {
			transform: translate3d(-260px, 0, 0);
		}
		100% {
			transform: translate3d(0, 0, 0);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.wave-back,
		.wave-front,
		.fish-container {
			animation: none !important;
		}
		.water-stage {
			transition: height 0.5s ease;
		}
	}
</style>
